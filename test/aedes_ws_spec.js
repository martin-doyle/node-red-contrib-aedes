/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');
const mqtt = require('mqtt/mqtt.js');

helper.init(require.resolve('node-red'));

describe('MQTT Broker Node', function () {
  beforeEach(function (done) {
    helper.startServer(done);
    console.log('Test: Start Server');
  });
  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(done);
      console.log('Test: Stop Server');
    });
  });

  it('should not throw an exception with 2 servers on the same ws port', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of two seconds

    helper.load([aedesNode, mqttNode], [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        mqtt_ws_port: '8080'
      }, {
        id: 'n11',
        type: 'aedes broker',
        mqtt_port: '1884',
        name: 'Aedes 1884',
        mqtt_ws_port: '8080'
      }
    ],
    function () {
      var n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Aedes 1883');
      var n11 = helper.getNode('n11');
      n11.should.have.property('name', 'Aedes 1884');
      done();
    });
  });

  it('a subscriber should receive a message from an external publisher', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    var flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        mqtt_ws_port: '8080',
        name: 'Aedes 1883',
        wires: [
          ['n2']
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }, {
        id: 'n4',
        type: 'mqtt in',
        name: 'Aedes In 1883',
        topic: 'test1883',
        broker: 'b1',
        wires: [
          ['n5']
        ]
      }, {
        id: 'n5',
        type: 'helper'
      }, {
        id: 'b1',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1883'
      }
    ];
    var client = mqtt.connect('ws://localhost:8080', { clientId: 'client', resubscribe: false, reconnectPeriod: -1 });
    client.on('error', function (err) {
      console.log('Error: ', err.toString());
    });
    client.on('connect', function () {
      console.log('External client connected');
    });
    helper.load([aedesNode, mqttNode], flow, function () {
      var n2 = helper.getNode('n2');
      var n5 = helper.getNode('n5');
      n2.on('input', function (msg) {
        console.log('Broker received message with topic ' + msg.topic);
        if (msg.topic === 'subscribe') {
          console.log('Client subscribed');
          client.publish('test1883', 'test');
        }
      });
      n5.on('input', function (msg) {
        console.log(msg);
        msg.should.have.property('topic', 'test1883');
        done();
      });
    });
  });
});
