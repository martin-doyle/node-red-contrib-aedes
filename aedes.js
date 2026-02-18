/**
 * Copyright 2013,2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  'use strict';
  const MongoPersistence = require('aedes-persistence-mongodb');
  const fs = require('fs');
  const path = require('path');
  const net = require('net');
  const tls = require('tls');
  const http = require('http');
  const https = require('https');
  const { WebSocketServer, createWebSocketStream } = require('ws');

  let serverUpgradeAdded = false;
  let wsPathNodeCount = 0;
  let boundHandleServerUpgrade = null;
  const listenerNodes = {};

  /**
   * Handles a server upgrade.
   *
   * @param {Object} request - The request object.
   * @param {Object} socket - The socket object.
   * @param {Object} head - The head object.
   */
  function handleServerUpgrade (request, socket, head) {
    const pathname = new URL(request.url, 'http://example.org').pathname;
    if (Object.prototype.hasOwnProperty.call(listenerNodes, pathname)) {
      listenerNodes[pathname]._wsPathServer.handleUpgrade(
        request,
        socket,
        head,
        function done (conn) {
          listenerNodes[pathname]._wsPathServer.emit('connection', conn, request);
        }
      );
    }
  }

  function checkWritable (dirPath, node) {
    try {
      fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch (err) {
      node.warn('aedes: userDir is not writable (' + dirPath + ') – file persistence disabled: ' + err.message);
      return false;
    }
  }

  async function saveSnapshot (broker, filePath, node) {
    try {
      node.debug('aedes: saving snapshot to ' + filePath);
      // 1. Collect retained messages via public stream API
      const retained = {};
      const stream = broker.persistence.createRetainedStreamCombi(['#']);
      node.debug('aedes: snapshot - collecting retained messages');
      node.debug('aedes: snapshot - stream is readable: ' + stream.readable);
      for await (const packet of stream) {
        node.debug('aedes: snapshot - processing retained message: ' + packet.topic);
        if (!packet.payload || packet.payload.length === 0) continue;
        retained[packet.topic] = {
          topic: packet.topic,
          payload: Buffer.from(packet.payload).toString('base64'),
          qos: packet.qos,
          retain: true,
          cmd: 'publish'
        };
      }

      // 2. Atomic write: temp file + rename
      const tmpFile = filePath + '.tmp';
      await fs.promises.writeFile(
        tmpFile,
        JSON.stringify({ retained }, null, 2),
        'utf8'
      );
      await fs.promises.rename(tmpFile, filePath);
      node.debug('aedes: snapshot saved to ' + filePath);
    } catch (err) {
      node.warn('aedes: could not save snapshot: ' + err.message);
    }
  }

  async function loadSnapshot (broker, filePath, node) {
    if (!checkWritable(RED.settings.userDir, node)) {
      return null;
    }
    if (!fs.existsSync(filePath)) {
      node.debug('aedes: no snapshot found at ' + filePath);
      return null;
    }
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (readErr) {
      node.warn(
        'aedes: could not read snapshot, starting with empty state: ' +
          readErr.message
      );
      return null;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      node.warn(
        'aedes: snapshot file is corrupt, starting with empty state: ' +
          parseErr.message
      );
      return null;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      node.warn(
        'aedes: snapshot file has unexpected format, starting with empty state'
      );
      return null;
    }
    // Restore retained messages via public API (batched to minimize yields)
    node.debug('aedes: restoring snapshot - retained messages: ' + Object.keys(data.retained || {}).length);
    if (data.retained && typeof data.retained === 'object') {
      const topics = Object.keys(data.retained);
      try {
        for (let i = 0; i < topics.length; i++) {
          const packet = data.retained[topics[i]];
          if (!packet.topic) continue;
          await broker.persistence.storeRetained({
            topic: packet.topic,
            payload: Buffer.from(packet.payload || '', 'base64'),
            qos: packet.qos || 0,
            retain: true,
            cmd: 'publish'
          });
        }
      } catch (err) {
        node.warn('aedes: failed to restore retained messages from snapshot: ' + err.message);
      }
      node.debug('aedes: snapshot restore complete');
    }
  }

  async function initializeBroker (node, config, aedesSettings, serverOptions) {
    const { Aedes } = await import('aedes');
    const broker = await Aedes.createBroker(aedesSettings);
    if (node._closing) { broker.close(); return; }
    node._broker = broker;

    if (config.persistence_bind !== 'mongodb' && config.persist_to_file === true) {
      const persistFile = path.join(RED.settings.userDir, 'aedes-persist-' + node.id + '.json');
      node._persistFile = persistFile;

      if (checkWritable(RED.settings.userDir, node)) {
        node._persistEnabled = true;

        // Load existing snapshot (must await so _initPromise resolves after restore)
        node._loadPromise = loadSnapshot(node._broker, persistFile, node)
          .catch(function (err) {
            node.warn('aedes: failed to load snapshot: ' + err.message);
          });

        // Periodic save every 60 seconds (with guard against concurrent saves)
        node._saving = false;
        node._snapshotInterval = setInterval(function () {
          if (node._saving) return;
          node._saving = true;
          saveSnapshot(node._broker, persistFile, node)
            .finally(function () { node._saving = false; });
        }, 60000);
      }
    }

    let server;
    if (node.usetls) {
      server = tls.createServer(serverOptions, broker.handle);
    } else {
      server = net.createServer(broker.handle);
    }
    node._netServer = server;

    if (node.mqtt_ws_port) {
      // Awkward check since http or ws do not fire an error event in case the port is in use
      const testServer = net.createServer();
      testServer.once('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          node.error(
            RED._('aedes-mqtt-broker.error.port-in-use', { port: config.mqtt_ws_port })
          );
        } else {
          node.error(
            RED._('aedes-mqtt-broker.error.server-error', { port: config.mqtt_ws_port, error: err.toString() })
          );
        }
        node.status({ fill: 'red', shape: 'ring', text: 'aedes-mqtt-broker.status.error' });
      });
      testServer.once('listening', function () {
        testServer.close();
      });

      testServer.once('close', function () {
        let httpServer;
        if (node.usetls) {
          httpServer = https.createServer(serverOptions);
        } else {
          httpServer = http.createServer();
        }
        node._wsHttpServer = httpServer;
        const wss = new WebSocketServer({ server: httpServer });
        wss.on('connection', function (websocket, req) {
          const stream = createWebSocketStream(websocket);
          broker.handle(stream, req);
        });
        node._wsServer = wss;
        httpServer.listen(config.mqtt_ws_port, function () {
          node.log(
            'Binding aedes mqtt server on ws port: ' + config.mqtt_ws_port
          );
        });
      });
      testServer.listen(config.mqtt_ws_port, function () {
        node.log('Checking ws port: ' + config.mqtt_ws_port);
      });
    }

    if (node.mqtt_ws_path !== '') {
      if (!serverUpgradeAdded) {
        boundHandleServerUpgrade = handleServerUpgrade;
        RED.server.on('upgrade', boundHandleServerUpgrade);
        serverUpgradeAdded = true;
      }
      wsPathNodeCount++;

      let path = RED.settings.httpNodeRoot || '/';
      path =
        path +
        (path.slice(-1) === '/' ? '' : '/') +
        (node.mqtt_ws_path.charAt(0) === '/'
          ? node.mqtt_ws_path.substring(1)
          : node.mqtt_ws_path);
      node.fullPath = path;

      if (Object.prototype.hasOwnProperty.call(listenerNodes, path)) {
        node.error(
          RED._('websocket.errors.duplicate-path', { path: node.mqtt_ws_path })
        );
      } else {
        listenerNodes[node.fullPath] = node;
        const serverOptions_ = {
          noServer: true
        };
        if (RED.settings.webSocketNodeVerifyClient) {
          serverOptions_.verifyClient = RED.settings.webSocketNodeVerifyClient;
        }

        node._wsPathServer = new WebSocketServer(serverOptions_);
        node._wsPathServer.on('connection', function (websocket, req) {
          const stream = createWebSocketStream(websocket);
          broker.handle(stream, req);
        });

        node.log('Binding aedes mqtt server on ws path: ' + node.fullPath);
      }
    }

    server.once('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        node.error(
          RED._('aedes-mqtt-broker.error.port-in-use', { port: node.mqtt_port })
        );
      } else {
        node.error(
          RED._('aedes-mqtt-broker.error.server-error', { port: node.mqtt_port, error: err.toString() })
        );
      }
      node.status({
        fill: 'red',
        shape: 'ring',
        text: 'aedes-mqtt-broker.status.error'
      });
    });

    // Set up authentication handler BEFORE starting the server
    if (node.credentials && node.username && node.password) {
      broker.authenticate = function (client, username, password, callback) {
        const authorized =
          username === node.username &&
          password &&
          password.toString() === node.password;
        if (authorized) {
          client.user = username;
        }
        callback(null, authorized);
      };
    }

    if (node.mqtt_port) {
      server.listen(node.mqtt_port, function () {
        node.log('Binding aedes mqtt server on port: ' + node.mqtt_port);
        node.status({
          fill: 'green',
          shape: 'dot',
          text: 'node-red:common.status.connected'
        });
      });
    }

    await node._loadPromise;

    broker.on('client', function (client) {
      const msg = {
        topic: 'client',
        payload: {
          client
        }
      };
      node.send([msg, null]);
    });

    broker.on('clientReady', function (client) {
      const msg = {
        topic: 'clientReady',
        payload: {
          client
        }
      };
      node.send([msg, null]);
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
    });

    broker.on('clientDisconnect', function (client) {
      const msg = {
        topic: 'clientDisconnect',
        payload: {
          client
        }
      };
      node.send([msg, null]);
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
    });

    broker.on('clientError', function (client, err) {
      const msg = {
        topic: 'clientError',
        payload: {
          client,
          err
        }
      };
      node.send([msg, null]);
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
    });

    broker.on('connectionError', function (client, err) {
      const msg = {
        topic: 'connectionError',
        payload: {
          client,
          err
        }
      };
      node.send([msg, null]);
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
    });

    broker.on('keepaliveTimeout', function (client) {
      const msg = {
        topic: 'keepaliveTimeout',
        payload: {
          client
        }
      };
      node.send([msg, null]);
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
    });

    broker.on('subscribe', function (subscriptions, client) {
      for (const subscription of subscriptions) {
        node.send([{
          topic: 'subscribe',
          payload: { topic: subscription.topic, qos: subscription.qos, client }
        }, null]);
      }
    });

    broker.on('unsubscribe', function (unsubscriptions, client) {
      for (const topic of unsubscriptions) {
        node.send([{
          topic: 'unsubscribe',
          payload: { topic, client }
        }, null]);
      }
    });

    if (node.wires && node.wires[1] && node.wires[1].length > 0) {
      node.log('Publish output wired. Enable broker publish event messages.');
      broker.on('publish', function (packet, client) {
        const msg = {
          topic: 'publish',
          payload: {
            packet,
            client
          }
        };
        node.send([null, msg]);
      });
    }

    broker.on('closed', function () {
      node.debug('Closed event');
    });
  }

  function AedesBrokerNode (config) {
    RED.nodes.createNode(this, config);
    this.mqtt_port = parseInt(config.mqtt_port, 10);
    this.mqtt_ws_port = parseInt(config.mqtt_ws_port, 10);
    this.mqtt_ws_path = '' + config.mqtt_ws_path;
    this.mqtt_ws_bind = config.mqtt_ws_bind;
    this.usetls = config.usetls;

    const certPath = config.cert ? config.cert.trim() : '';
    const keyPath = config.key ? config.key.trim() : '';
    const caPath = config.ca ? config.ca.trim() : '';

    this.uselocalfiles = config.uselocalfiles;
    this.dburl = config.dburl;

    if (this.mqtt_ws_bind === 'path') {
      this.mqtt_ws_port = 0;
    } else {
      this.mqtt_ws_path = '';
    }

    if (certPath.length > 0 || keyPath.length > 0 || caPath.length > 0) {
      if ((certPath.length > 0) !== (keyPath.length > 0)) {
        this.valid = false;
        this.error(RED._('tls.error.missing-file'));
        return;
      }
      try {
        if (certPath) {
          this.cert = fs.readFileSync(certPath);
        }
        if (keyPath) {
          this.key = fs.readFileSync(keyPath);
        }
        if (caPath) {
          this.ca = fs.readFileSync(caPath);
        }
      } catch (err) {
        this.valid = false;
        this.error(err.toString());
        return;
      }
    } else {
      if (this.credentials) {
        this.cert = this.credentials.certdata || '';
        this.key = this.credentials.keydata || '';
        this.ca = this.credentials.cadata || '';
      }
    }
    if (this.credentials) {
      this.username = this.credentials.username;
      this.password = this.credentials.password;
    }

    if (typeof this.usetls === 'undefined') {
      this.usetls = false;
    }

    const node = this;

    const aedesSettings = {};
    const serverOptions = {};

    if (config.persistence_bind === 'mongodb' && config.dburl) {
      aedesSettings.persistence = MongoPersistence({
        url: config.dburl
      });
      node.log('Start persistence to MongoDB');
    }

    // File persistence (only for in-memory mode with persist_to_file enabled)

    if (this.cert && this.key && this.usetls) {
      serverOptions.cert = this.cert;
      serverOptions.key = this.key;
      serverOptions.ca = this.ca;
    }

    node._closing = false;
    node._broker = null;
    node._netServer = null;
    node._wsServer = null;
    node._wsHttpServer = null;
    node._persistEnabled = false;
    node._snapshotInterval = null;
    node._persistFile = null;
    node._loadPromise = null;
    node._trackedSubs = null;
    node._saving = false;

    node._initPromise = initializeBroker(node, config, aedesSettings, serverOptions);
    node._initPromise.catch(function (err) {
      node.error(RED._('aedes-mqtt-broker.error.init-failed', { error: err.toString() }));
      node.status({ fill: 'red', shape: 'ring', text: 'aedes-mqtt-broker.status.init-failed' });
    });

    this.on('close', async function (removed, done) {
      node._closing = true;
      if (removed) {
        node.debug('Node removed or disabled');
      } else {
        node.debug('Node restarting');
      }
      try {
        await node._initPromise;
        // Stop periodic snapshot interval
        if (node._snapshotInterval) {
          clearInterval(node._snapshotInterval);
          node._snapshotInterval = null;
        }

        // Save final snapshot on shutdown (wait if an interval save is in progress)
        if (node._persistEnabled && node._broker) {
          // Wait for any in-progress interval save to complete
          const waitForSave = new Promise(function (resolve) {
            const check = setInterval(function () {
              if (!node._saving) {
                clearInterval(check);
                resolve();
              }
            }, 50);
          });
          await waitForSave;
          await saveSnapshot(node._broker, node._persistFile, node);
        }
        closeBroker(node, done);
      } catch (e) {
        done();
      }
    });
  }

  function closeBroker (node, done) {
    process.nextTick(function () {
      function wsClose () {
        if (node._wsServer) {
          // Terminate all existing WebSocket connections so close() callback fires promptly
          node.log('Unbinding aedes mqtt server from ws port: ' + node.mqtt_ws_port);
          node._wsServer.clients.forEach(function (ws) {
            ws.terminate();
          });
          node._wsServer.close(function () {
            if (node._wsHttpServer) {
              node._wsHttpServer.close(function () { done(); });
            } else { done(); }
          });
        } else { done(); }
      }
      function serverClose () {
        if (node._netServer) {
          node.log('Unbinding aedes mqtt server from port: ' + node.mqtt_port);
          node.status({
            fill: 'red',
            shape: 'ring',
            text: 'node-red:common.status.disconnected'
          });
          node._netServer.close(function () {
            if (node.mqtt_ws_path !== '' && node.fullPath) {
              node.log('Unbinding aedes mqtt server from ws path: ' + node.fullPath);
              delete listenerNodes[node.fullPath];
              // Remove upgrade listener if this is the last WS-path node
              wsPathNodeCount--;
              if (wsPathNodeCount <= 0 && serverUpgradeAdded && boundHandleServerUpgrade) {
                RED.server.removeListener('upgrade', boundHandleServerUpgrade);
                serverUpgradeAdded = false;
                boundHandleServerUpgrade = null;
                wsPathNodeCount = 0;
              }
              if (node._wsPathServer) {
                // Terminate all existing WebSocket connections so close() callback fires promptly
                node._wsPathServer.clients.forEach(function (ws) {
                  ws.terminate();
                });
                node._wsPathServer.close(function () { wsClose(); });
              } else { wsClose(); }
            } else { wsClose(); }
          });
        } else { wsClose(); }
      }
      if (node._broker) {
        node._broker.close(function () { serverClose(); });
      } else { serverClose(); }
    });
  }

  RED.nodes.registerType('aedes broker', AedesBrokerNode, {
    credentials: {
      username: { type: 'text' },
      password: { type: 'password' },
      certdata: { type: 'text' },
      cadata: { type: 'text' },
      keydata: { type: 'text' }
    }
  });
};
