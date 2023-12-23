/* eslint-env mocha */
/* eslint no-console: ["error", { allow: ["warn", "error"] }] */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');
const mqtt = require('mqtt');

const credentialsOK = { n1: { username: 'test', password: 'test' }, b1: { user: 'test', password: 'test' } };
const credentialsMissing = { n1: { username: 'test', password: 'test' }, b1: { user: 'test' } };

helper.init(require.resolve('node-red'));

describe('Aedes Broker TCP tests', function () {
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

  it('should connect an mqtt client', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds

    helper.load([aedesNode, mqttNode], [
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
      }, {
        id: 'n3',
        type: 'mqtt in',
        name: 'Aedes1 1883',
        topic: 'test1883',
        broker: 'b1'
      }, {
        id: 'b1',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1883'
      }
    ],
    function () {
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        msg.should.have.property('topic', 'clientReady');
        done();
      });
    });
  });

  it('should not connect an mqtt client with missing authentication', function (done) {
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
      }, {
        id: 'n3',
        type: 'mqtt in',
        name: 'Aedes1 1883',
        topic: 'test1883',
        broker: 'b1'
      }, {
        id: 'b1',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1883'
      }
    ];

    helper.load([aedesNode, mqttNode], flow, credentialsMissing,
      function () {
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          msg.should.have.property('topic', 'clientError');
          done();
        });
      });
  });

  it('should connect an mqtt client with authentication', function (done) {
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
      }, {
        id: 'n3',
        type: 'mqtt in',
        name: 'Aedes1 1883',
        topic: 'test1883',
        broker: 'b1'
      }, {
        id: 'b1',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1883'
      }
    ];

    helper.load([aedesNode, mqttNode], flow, credentialsOK,
      function () {
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          msg.should.have.property('topic', 'clientReady');
          done();
        });
      });
  });

  it('a subscriber should receive a message from a publisher', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    helper.load([aedesNode, mqttNode], [
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
      }, {
        id: 'n3',
        type: 'mqtt out',
        name: 'Aedes Out 1883',
        topic: 'test1883',
        broker: 'b1'
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
    ],
    function () {
      const n2 = helper.getNode('n2');
      const n3 = helper.getNode('n3');
      const n5 = helper.getNode('n5');
      n2.on('input', function (msg) {
        if (msg.topic === 'subscribe') {
          n3.receive({ payload: 'test' });
        }
      });
      n5.on('input', function (msg) {
        msg.should.have.property('topic', 'test1883');
        done();
      });
    });
  });

  it('should connect 2 mqtt clients on 2 servers', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds

    helper.load([aedesNode, mqttNode], [
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
      }, {
        id: 'n3',
        type: 'mqtt in',
        name: 'Aedes 1883',
        topic: 'test1883',
        broker: 'b1'
      }, {
        id: 'b1',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1883'
      }, {
        id: 'n11',
        type: 'aedes broker',
        mqtt_port: '1884',
        name: 'Aedes 1884',
        wires: [
          ['n12'], []
        ]
      }, {
        id: 'n12',
        type: 'helper'
      }, {
        id: 'n13',
        type: 'mqtt in',
        name: 'Aedes 1884',
        topic: 'test1884',
        broker: 'b11'
      }, {
        id: 'b11',
        type: 'mqtt-broker',
        name: 'Broker',
        broker: 'localhost',
        port: '1884'
      }
    ],
    function () {
      let i = 0;
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        msg.should.have.property('topic', 'clientReady');
        i++;
        if (i === 2) {
          done();
        }
      });
      const n12 = helper.getNode('n12');
      n12.on('input', function (msg) {
        msg.should.have.property('topic', 'clientReady');
        i++;
        if (i === 2) {
          done();
        }
      });
    });
  });

  it('should not throw an exception with 2 servers on the same mqtt port', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds

    helper.load([aedesNode, mqttNode], [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [
          [], []
        ]
      }, {
        id: 'n11',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883 2',
        wires: [
          [], []
        ]
      }
    ],
    function () {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Aedes 1883');
      const n11 = helper.getNode('n11');
      n11.should.have.property('name', 'Aedes 1883 2');
      done();
    });
  });

  it('should connect an external mqtt client', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    const flow = [{
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
    }];
    helper.load(aedesNode, flow, function () {
      const client = mqtt.connect('mqtt://localhost:1883', { clientId: 'client', resubscribe: false, reconnectPeriod: -1 });
      client.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client.on('connect', function () {
        // console.log('External client connected');
      });
      const n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        msg.should.have.property('topic', 'clientReady');
        client.end(function () {
          done();
        });
      });
    });
  });

  it('a subscriber should receive a message from an external publisher', function (done) {
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
    helper.load([aedesNode, mqttNode], flow, function () {
      const client = mqtt.connect('mqtt://localhost:1883', { clientId: 'client', resubscribe: false, reconnectPeriod: -1 });
      client.on('error', function (err) {
        console.error('Error: ', err.toString());
      });
      client.on('connect', function () {
        // console.log('External client connected');
      });
      const n2 = helper.getNode('n2');
      const n5 = helper.getNode('n5');
      n2.on('input', function (msg) {
        if (msg.topic === 'subscribe') {
          client.publish('test1883', 'test');
        }
      });
      n5.on('input', function (msg) {
        // console.log(msg);
        msg.should.have.property('topic', 'test1883');
        client.end(function () {
          done();
        });
      });
    });
  });
});
