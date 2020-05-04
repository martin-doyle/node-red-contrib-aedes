/* eslint-env mocha */
/* eslint no-console: ["error", { allow: ["warn", "error"] }] */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqtt = require('mqtt/mqtt.js');
const should = require('should');

helper.init(require.resolve('node-red'));

describe('Aedes Broker Last Will tests', function () {
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
      name: 'Aedes 1883'
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Aedes 1883');
      done();
    });
  });

  it('a subscriber should receive a last will message on publisher disconnect', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
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
    const client1 = mqtt.connect('mqtt://localhost:1883', { clientId: 'client1', will: { topic: 'testLastWill', payload: 'last will' } });
    client1.on('error', function (err) {
      console.error('Error: ', err.toString());
    });
    client1.on('connect', function () {
      // console.log('External client1 connected');
    });
    helper.load([aedesNode], flow, function () {
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        // console.log('Broker received message topic: ' + msg.topic + ', clientid: ' + msg.payload.client.id);
        if (msg.topic === 'clientReady') {
          // console.log('Topic: ' + msg.payload.client.will.topic);
          // console.log('Payload: ' + msg.payload.client.will.payload.toString());
          should(msg.payload.client.will.topic).equal('testLastWill');
          should(msg.payload.client.will.payload.toString()).equal('last will');
          client1.end(function () {
            done();
          });
        }
      });
    });
  });
});
