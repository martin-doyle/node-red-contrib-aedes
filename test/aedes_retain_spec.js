/* eslint-env mocha */
/* eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');
const mqtt = require('mqtt');
const should = require('should');

helper.init(require.resolve('node-red'));

describe('Aedes Broker retain tests', function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });
  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(done);
    });
  });

  it('should be loaded', function (done) {
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1883',
      name: 'Aedes 1883',
      wires: [
        [], []
      ]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Aedes 1883');
      done();
    });
  });
  it('a subscriber (retain = true) should receive a message on first subscribe', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [
          ['n2'], []
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];
    helper.load([aedesNode, mqttNode], flow, function () {
      const client1 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client1' });
      const client2 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client2' });
      client1.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client2.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client1.on('connect', function () {
        // console.log('External client1 connected');
        client1.publish('test1883', 'test', { retain: true }, function () {
          // console.log('Published  test');
          client2.subscribe('test1883', function (err, granted) {
            // console.log('Subscription successful ' + JSON.stringify(granted));
            if (err) {
              console.error('Error subscribing');
              done();
            }
          });
        });
      });
      client2.on('connect', function () {
        // console.log('External client2 connected');
      });

      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        // console.log('Broker received message topic: ' + msg.topic + ', clientid: ' + msg.payload.client.id);
        if (msg.topic === 'subscribe') {
          // console.log('Client ' + msg.payload.client.id + ' subscribed ' + JSON.stringify(msg.payload.client.subscriptions));
        } else if (msg.topic === 'clientReady') {
          // console.log('Client ' + msg.payload.client.id + ' connected with clean ' + msg.payload.client.clean);
        }
      });
      client2.on('message', function (topic, message) {
        // console.log(message.toString());
        should(topic.toString()).equal('test1883');
        should(message.toString()).equal('test');
        client2.end(function () {
          client1.end(function () {
            done();
          });
        });
      });
    });
  });
  it('a subscriber (retain = true) should only receive the last message on first subscribe', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [
          ['n2'], []
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];
    helper.load([aedesNode, mqttNode], flow, function () {
      const client1 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client1' });
      const client2 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client2' });
      client1.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client2.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client2.on('connect', function () {
        // console.log('External client2 connected');
      });
      client1.on('connect', function () {
        // console.log('External client1 connected');
        client1.publish('test1883', 'test1', { retain: true }, function () {
          // console.log('Published  test1');
          client1.publish('test1883', 'test2', { retain: true }, function () {
            // console.log('Published  test2');
            client2.subscribe('test1883', function (err, granted) {
              // console.log('Subscription successful ' + JSON.stringify(granted));
              if (err) {
                console.error('Error subscribing');
                done();
              }
            });
          });
        });
      });
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        // console.log('Broker received message topic: ' + msg.topic + ', clientid: ' + msg.payload.client.id);
        if (msg.topic === 'subscribe') {
          // console.log('Client ' + msg.payload.client.id + ' subscribed ' + JSON.stringify(msg.payload.client.subscriptions));
        } else if (msg.topic === 'clientReady') {
          // console.log('Client ' + msg.payload.client.id + ' connected with clean ' + msg.payload.client.clean);
        }
      });
      client2.on('message', function (topic, message) {
        // console.log(message.toString());
        should(topic.toString()).equal('test1883');
        should(message.toString()).equal('test2');
        client2.end(function () {
          client1.end(function () {
            done();
          });
        });
      });
    });
  });

  /*

  it('a publisher (retain = true) should send a message', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        persistence_bind: 'level',
        name: 'Aedes 1883',
        wires: [
          ['n2'], []
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];

    helper.load([aedesNode, mqttNode], flow, function () {
      const client1 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client1' });
      client1.on('error', function (err) {
        console.error('Error: ', err.toString());
      });

      client1.on('connect', function () {
        // console.log('External client1 connected');
        client1.subscribe('test1883', function (err, granted) {
          // console.log('Subscription successful ' + JSON.stringify(granted));
          if (err) {
            console.error('Error subscribing');
            done();
          }
          client1.publish('test1883', 'Retained Message', { retain: true }, function () {
            // console.log('Published  Retained Message');
          });
        });
        const n2 = helper.getNode('n2');
        let counter = 0;
        n2.on('input', function (msg) {
          // console.log('Broker received message topic: ' + msg.topic + ', clientid: ' + msg.payload.client.id);
          if (msg.topic === 'subscribe') {
            // console.log('Client ' + msg.payload.client.id + ' subscribed ' + JSON.stringify(msg.payload.client.subscriptions));
          } else if (msg.topic === 'clientReady') {
            // console.log('Client ' + msg.payload.client.id + ' connected with clean ' + msg.payload.client.clean);
          }
        });
        client1.on('message', function (topic, message) {
          if (counter === 0) {
            counter++;
          } else {
            return;
          }
          console.log(message.toString());
          should(topic.toString()).equal('test1883');
          should(message.toString()).equal('Retained Message');
          try {
            client1.end(true, {}, function () {
              done();
            });
          } catch (err) {
            done(err);
          }
        });
      });
    });
  });

  it('a subscriber (retain = true) should receive the last message on first subscribe after restart', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        persistence_bind: 'level',
        name: 'Aedes 1883',
        wires: [
          ['n2']
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];

    helper.load([aedesNode, mqttNode], flow, function () {
      const client1 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client1' });
      client1.on('error', function (err) {
        console.error('Error: ', err.toString());
      });

      client1.on('connect', function () {
        // console.log('External client1 connected');
        client1.subscribe('test1883', function (err, granted) {
          // console.log('Subscription successful ' + JSON.stringify(granted));
          if (err) {
            console.error('Error subscribing');
            done();
          }
        });
      });
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        // console.log('Broker received message topic: ' + msg.topic + ', clientid: ' + msg.payload.client.id);
        if (msg.topic === 'subscribe') {
          // console.log('Client ' + msg.payload.client.id + ' subscribed ' + JSON.stringify(msg.payload.client.subscriptions));
        } else if (msg.topic === 'clientReady') {
          // console.log('Client ' + msg.payload.client.id + ' connected with clean ' + msg.payload.client.clean);
        }
      });
      client1.on('message', function (topic, message) {
        // console.log(message.toString());
        should(topic.toString()).equal('test1883');
        should(message.toString()).equal('Retained Message');
        client1.end(true, {}, function () {
          done();
        });
      });
    });
  });
  */
});
