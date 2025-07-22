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
  // const { Level } = require('level');
  // const LevelPersistence = require('aedes-persistence-level');
  const aedes = require('aedes');
  const fs = require('fs');
  const net = require('net');
  const tls = require('tls');
  const http = require('http');
  const https = require('https');
  const ws = require('websocket-stream');

  let serverUpgradeAdded = false;
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
      listenerNodes[pathname].server.handleUpgrade(
        request,
        socket,
        head,
        function done (conn) {
          listenerNodes[pathname].server.emit('connection', conn, request);
        }
      );
    }
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
      node.log('Start persistence to MongeDB');
      /*
    } else if (config.persistence_bind === 'level') {
      aedesSettings.persistence = LevelPersistence(new Level('leveldb'));
      node.log('Start persistence to LevelDB');
      */
    }

    if (this.cert && this.key && this.usetls) {
      serverOptions.cert = this.cert;
      serverOptions.key = this.key;
      serverOptions.ca = this.ca;
    }

    const broker = aedes.createBroker(aedesSettings);
    let server;
    if (this.usetls) {
      server = tls.createServer(serverOptions, broker.handle);
    } else {
      server = net.createServer(broker.handle);
    }

    let wss = null;
    let httpServer = null;

    if (this.mqtt_ws_port) {
      // Awkward check since http or ws do not fire an error event in case the port is in use
      const testServer = net.createServer();
      testServer.once('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          node.error(
            'Error: Port ' + config.mqtt_ws_port + ' is already in use'
          );
        } else {
          node.error(
            'Error creating net server on port ' +
              config.mqtt_ws_port +
              ', ' +
              err.toString()
          );
        }
      });
      testServer.once('listening', function () {
        testServer.close();
      });

      testServer.once('close', function () {
        if (node.usetls) {
          httpServer = https.createServer(serverOptions);
        } else {
          httpServer = http.createServer();
        }
        wss = ws.createServer(
          {
            server: httpServer
          },
          broker.handle
        );
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

    if (this.mqtt_ws_path !== '') {
      if (!serverUpgradeAdded) {
        RED.server.on('upgrade', handleServerUpgrade);
        serverUpgradeAdded = true;
      }

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
        return;
      }
      listenerNodes[node.fullPath] = node;
      const serverOptions_ = {
        noServer: true
      };
      if (RED.settings.webSocketNodeVerifyClient) {
        serverOptions_.verifyClient = RED.settings.webSocketNodeVerifyClient;
      }

      node.server = ws.createServer(
        {
          noServer: true
        },
        broker.handle
      );

      node.log('Binding aedes mqtt server on ws path: ' + node.fullPath);
    }

    server.once('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        node.error('Error: Port ' + config.mqtt_port + ' is already in use');
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'node-red:common.status.disconnected'
        });
      } else {
        node.error('Error: Port ' + config.mqtt_port + ' ' + err.toString());
        node.status({
          fill: 'red',
          shape: 'ring',
          text: 'node-red:common.status.disconnected'
        });
      }
    });

    if (this.mqtt_port) {
      server.listen(this.mqtt_port, function () {
        node.log('Binding aedes mqtt server on port: ' + config.mqtt_port);
        node.status({
          fill: 'green',
          shape: 'dot',
          text: 'node-red:common.status.connected'
        });
      });
    }

    if (this.credentials && this.username && this.password) {
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
      node.status({
        fill: 'green',
        shape: 'dot',
        text: RED._('aedes-mqtt-broker.status.connected', {
          count: broker.connectedClients
        })
      });
      node.send([msg, null]);
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

    broker.on('subscribe', function (subscription, client) {
      const msg = {
        topic: 'subscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client
        }
      };
      node.send([msg, null]);
    });

    broker.on('unsubscribe', function (subscription, client) {
      const msg = {
        topic: 'unsubscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client
        }
      };
      node.send([msg, null]);
    });

    if (this.wires && this.wires[1] && this.wires[1].length > 0) {
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

    this.on('close', function (done) {
      process.nextTick(function onCloseDelayed () {
        function wsClose () {
          if (wss) {
            node.log(
              'Unbinding aedes mqtt server from ws port: ' + config.mqtt_ws_port
            );
            wss.close(function () {
              node.debug('after wss.close(): ');
              httpServer.close(function () {
                node.debug('after httpServer.close(): ');
                done();
              });
            });
          } else {
            done();
          }
        }

        function brokerClose () {
          broker.close(function () {
            node.log(
              'Unbinding aedes mqtt server from port: ' + config.mqtt_port
            );
            server.close(function () {
              node.debug('after server.close(): ');
              if (node.mqtt_ws_path !== '') {
                node.log(
                  'Unbinding aedes mqtt server from ws path: ' + node.fullPath
                );
                delete listenerNodes[node.fullPath];
                node.server.close(function () {
                  wsClose();
                });
              } else {
                wsClose();
              }
            });
          });
        }
        brokerClose();
      });
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
