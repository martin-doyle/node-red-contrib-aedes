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

  function AedesInNode(config) {
    RED.nodes.createNode(this, config);
    this.mqtt_port = parseInt(config.mqtt_port);
    this.mqtt_ws_port = parseInt(config.mqtt_ws_port);

    var aedesSettings = {};

    if (config.dburl) {
      aedesSettings.persistence = mongoPersistence({
        url: config.dburl
      })
    }

    const broker = new aedes.Server(aedesSettings);
    const server = net.createServer(broker.handle);

    let wss = null;

    if (this.mqtt_ws_port) {
      const testServer = net.createServer();
      testServer.once('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          node.error('Error: Port ' + config.mqtt_ws_port + ' is already in use');
        }
      });
      testServer.once('listening', function () {
        testServer.close();
      });
      testServer.once('close', function () {
        wss = ws.createServer({
          port: config.mqtt_ws_port
        }, aedes.handle);
      });
      testServer.listen(config.mqtt_ws_port, function () {
        node.log('Binding aedes mqtt server on ws port: ' + config.mqtt_ws_port);
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

    var node = this;

    if (config.username && config.password) {
      var authenticate = function (client, username, password, callback) {
        var authorized = (username == config.username && password == config.password);
        if (authorized) client.user = username;
        callback(null, authorized);
      };

      server.authenticate = authenticate
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

    broker.on('closed', function () {
      node.log('Closed event');
    });

    this.on('close', function () {
      node.log('Unbinding aedes mqtt server from port: ' + this.mqtt_port);
      broker.close(function () {
        server.close(function () {
          node.log('after server.close(): ');
        });
        if (wss) {
          wss.close(function () {
            node.log('after wss.close(): ');
          });
        }
      });
    });
  }

  RED.nodes.registerType('aedes broker', AedesInNode);
};
