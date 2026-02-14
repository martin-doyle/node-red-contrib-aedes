/* eslint-env mocha */
/* eslint no-console: ["error", { allow: ["warn", "error"] }] */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');
const mqtt = require('mqtt');
const should = require('should');

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
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          msg.should.have.property('topic', 'clientReady');
          done();
        });
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
        const n1 = helper.getNode('n1');
        n1._initPromise.then(function () {
          const n2 = helper.getNode('n2');
          n2.on('input', function (msg) {
            msg.should.have.property('topic', 'clientError');
            done();
          });
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
        const n1 = helper.getNode('n1');
        n1._initPromise.then(function () {
          const n2 = helper.getNode('n2');
          n2.on('input', function (msg) {
            msg.should.have.property('topic', 'clientReady');
            done();
          });
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
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
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
      const n1 = helper.getNode('n1');
      const n11 = helper.getNode('n11');
      Promise.all([n1._initPromise, n11._initPromise]).then(function () {
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
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
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
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
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

  it('should handle initialization failure gracefully', function (done) {
    this.timeout(10000);
    const net = require('net');
    // Occupy port 1887 to force an EADDRINUSE
    const blocker = net.createServer();
    blocker.listen(1887, function () {
      const flow = [{
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1887',
        name: 'Aedes 1887',
        wires: [[], []]
      }];
      helper.load(aedesNode, flow, function () {
        const n1 = helper.getNode('n1');
        n1._initPromise.then(function () {
          // Init succeeded but server.listen should have fired an error
          blocker.close(function () {
            done();
          });
        }).catch(function () {
          // Expected to fail
          blocker.close(function () {
            done();
          });
        });
      });
    });
  });

  it('should emit clientDisconnect when a client disconnects', function (done) {
    this.timeout(10000);
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [['n2'], []]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const client = mqtt.connect('mqtt://localhost:1883', {
          clientId: 'client-disconnect-test',
          resubscribe: false,
          reconnectPeriod: -1
        });
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          if (msg.topic === 'clientReady') {
            client.end();
          } else if (msg.topic === 'clientDisconnect') {
            should(msg.payload.client.id).equal('client-disconnect-test');
            done();
          }
        });
      });
    });
  });

  it('should emit keepaliveTimeout when a client stops responding', function (done) {
    this.timeout(10000);
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [['n2'], []]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const net = require('net');
        const socket = net.createConnection({ port: 1883 }, function () {
          // Send a minimal MQTT CONNECT packet with keepalive=1 second
          const connectPacket = Buffer.from([
            0x10, // CONNECT packet type
            0x11, // Remaining length: 17
            0x00, 0x04, // Protocol name length
            0x4D, 0x51, 0x54, 0x54, // "MQTT"
            0x04, // Protocol level 4 (MQTT 3.1.1)
            0x02, // Connect flags (clean session)
            0x00, 0x01, // Keep alive: 1 second
            0x00, 0x05, // Client ID length: 5
            0x6B, 0x61, 0x74, 0x65, 0x73 // "kates"
          ]);
          socket.write(connectPacket);
          // Do not send any more data — keepalive will expire
        });
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          if (msg.topic === 'keepaliveTimeout') {
            should(msg.payload.client.id).equal('kates');
            socket.destroy();
            done();
          }
        });
      });
    });
  });

  it('should emit published messages on the 2nd output', function (done) {
    this.timeout(10000);
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1883',
        name: 'Aedes 1883',
        wires: [[], ['n2']]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const client = mqtt.connect('mqtt://localhost:1883', {
          clientId: 'publish-test',
          resubscribe: false,
          reconnectPeriod: -1
        });
        client.on('connect', function () {
          client.publish('testTopic', 'testPayload');
        });
        const n2 = helper.getNode('n2');
        n2.on('input', function (msg) {
          if (msg.payload.packet && msg.payload.packet.topic === 'testTopic') {
            should(msg.topic).equal('publish');
            should(msg.payload.packet.payload.toString()).equal('testPayload');
            client.end(function () {
              done();
            });
          }
        });
      });
    });
  });

  it('should handle close during initialization', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1888',
      name: 'Aedes 1888',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      // Immediately unload before init completes
      helper.unload().then(function () {
        done();
      });
    });
  });
});
