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
  const mongoPersistence = require('aedes-persistence-mongodb');
  const aedes = require('aedes');
  const net = require('net');
  const ws = require('websocket-stream');

  function AedesBrokerNode(config) {
    RED.nodes.createNode(this, config);
    this.mqtt_port = parseInt(config.mqtt_port);
    this.mqtt_ws_port = parseInt(config.mqtt_ws_port);
    var node = this;

    var aedesSettings = {};

    if (config.dburl) {
      aedesSettings.persistence = mongoPersistence({
        url: config.dburl
      });
      node.log('Start persistence to MongeDB');
    }

    const broker = new aedes.Server(aedesSettings);
    const server = net.createServer(broker.handle);

    let wss = null;

    if (this.mqtt_ws_port) {
      // Awkward check since http or ws do not fire an error event in case the port is in use
      const testServer = net.createServer();
      testServer.once('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          node.error('Error: Port ' + config.mqtt_ws_port + ' is already in use');
        } else {
          node.error('Error creating net server on port ' + config.mqtt_ws_port + ', ' + err.toString());
        }
      });
      testServer.once('listening', function () {
        testServer.close();
      });

      testServer.once('close', function () {
        wss = ws.createServer({
          port: config.mqtt_ws_port
        }, broker.handle);
        node.log('Binding aedes mqtt server on ws port: ' + config.mqtt_ws_port);
      });
      testServer.listen(config.mqtt_ws_port, function () {
        node.log('Checking ws port: ' + config.mqtt_ws_port);
      });

    }

    server.once('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        node.error('Error: Port ' + config.mqtt_port + ' is already in use');
      }
    });

    if (this.mqtt_port) {
      server.listen(this.mqtt_port, function () {
        node.log('Binding aedes mqtt server on port: ' + config.mqtt_port);
      });
    }

    if (config.credentials.username && config.credentials.password) {
      var authenticate = function (client, username, password, callback) {
        var authorized = (username == config.username && password == config.password);
        if (authorized) client.user = username;
        callback(null, authorized);
      };

      broker.authenticate = authenticate
    }

    broker.on('client', function (client) {
      var msg = {
        topic: 'client',
        payload: {
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('clientReady', function (client) {
      var msg = {
        topic: 'clientReady',
        payload: {
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('clientDisconnect', function (client) {
      var msg = {
        topic: 'clientDisconnect',
        payload: {
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('clientError', function (client, err) {
      var msg = {
        topic: 'clientError',
        payload: {
          client: client,
          err: err
        }
      };
      node.send(msg);
    });

    broker.on('connectionError', function (client, err) {
      var msg = {
        topic: 'connectionError',
        payload: {
          client: client,
          err: err
        }
      };
      node.send(msg);
    });

    broker.on('keepaliveTimeout', function (client) {
      var msg = {
        topic: 'keepaliveTimeout',
        payload: {
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('subscribe', function (subscription, client) {
      var msg = {
        topic: 'subscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('unsubscribe', function (subscription, client) {
      var msg = {
        topic: 'unsubscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client: client
        }
      };
      node.send(msg);
    });

    /*
    broker.on('publish', function(packet,client) {
      var msg = {
        topic: 'publish',
        payload: {
          packet: packet,
          client: client
        }
      };
      node.send(msg);
    });
    */

    broker.on('closed', function () {
      node.log('Closed event');
    });

    this.on('close', function (done) {
      broker.close(function () {
        node.log('Unbinding aedes mqtt server from port: ' + this.mqtt_port);
        server.close(function () {
          node.debug('after server.close(): ');
          if (wss) {
            node.log('Unbinding aedes mqtt server from ws port: ' + this.mqtt_ws_port);
            wss.close(function () {
              node.debug('after wss.close(): ');
              done();
            });
          } else {
            done();
          }
        });
      });
    });
  }

  RED.nodes.registerType('aedes broker', AedesBrokerNode, {
     credentials: {
         username: {type:"text"},
         password: {type:"password"}
     }
  });
};
