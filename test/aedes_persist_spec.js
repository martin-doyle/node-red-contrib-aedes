/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const should = require('should');

let tmpDir;

helper.init(require.resolve('node-red'));

describe('Aedes Broker Persistence - Group 1: Happy Path', function () {
  beforeEach(function (done) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aedes-test-'));
    helper.init(require.resolve('node-red'), { userDir: tmpDir });
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(function () {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        done();
      });
    });
  });

  it('should not create snapshot file when persist_to_file is false', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1890',
      persist_to_file: false,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        should.not.exist(n1._persistEnabled);
        should.not.exist(n1._snapshotInterval);
        const files = fs.readdirSync(tmpDir).filter(function (f) {
          return f.startsWith('aedes-persist-');
        });
        files.length.should.equal(0);
        done();
      });
    });
  });

  it('should write snapshot file on close when persist_to_file is true', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1890',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const persistFile = n1._persistFile;
        should.exist(persistFile);
        helper.unload().then(function () {
          fs.existsSync(persistFile).should.be.true();
          done();
        });
      });
    });
  });

  it('should restore retained message from snapshot on start', function (done) {
    this.timeout(10000);
    const snapshotData = {
      retained: {
        'test/restore': {
          topic: 'test/restore',
          payload: Buffer.from('hello').toString('base64'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        }
      },
      subscriptions: {}
    };
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData), 'utf8');

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1890',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const stream = n1._broker.persistence.createRetainedStream('#');
        console.log('Created retained stream, waiting for data...');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          packets.length.should.equal(1);
          packets[0].topic.should.equal('test/restore');
          packets[0].payload.toString().should.equal('hello');
          done();
        });
      });
    });
  });

  it('should write empty retained for a fresh broker', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1890',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const persistFile = n1._persistFile;
        should.exist(persistFile);
        helper.unload().then(function () {
          const stat = fs.statSync(persistFile);
          stat.isFile().should.be.true();
          const data = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
          data.should.have.property('retained');
          Object.keys(data.retained).length.should.equal(0);
          done();
        }).catch(done);
      });
    });
  });

  it('should set up periodic save interval and persist retained messages', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1890',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Verify periodic save interval is set up
        should.exist(n1._snapshotInterval);

        // Store a retained message via public API
        const filePath = n1._persistFile;
        n1._broker.persistence
          .storeRetained({
            topic: 'test/periodic',
            payload: Buffer.from('periodic-data'),
            qos: 0,
            retain: true,
            cmd: 'publish'
          })
          .then(function () {
            return helper.unload();
          })
          .then(function () {
            const stat = fs.statSync(filePath);
            stat.isFile().should.be.true();
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            data.retained.should.have.property('test/periodic');
            done();
          })
          .catch(done);
      });
    });
  });
});

describe('Aedes Broker Persistence - Group 2: Snapshot Integrity', function () {
  beforeEach(function (done) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aedes-test-'));
    helper.init(require.resolve('node-red'), { userDir: tmpDir });
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(function () {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        done();
      });
    });
  });

  it('should survive base64 encode/decode round-trip for binary payloads', function (done) {
    this.timeout(10000);
    // Create a binary buffer with all byte values 0x00-0xFF
    const binaryPayload = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      binaryPayload[i] = i;
    }
    const snapshotData = {
      retained: {
        'test/binary': {
          topic: 'test/binary',
          payload: binaryPayload.toString('base64'),
          qos: 1,
          retain: true,
          cmd: 'publish'
        }
      },
      subscriptions: {}
    };
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData), 'utf8');

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1891',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Verify the binary payload was restored correctly
        const stream = n1._broker.persistence.createRetainedStream('#');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          packets.length.should.equal(1);
          packets[0].topic.should.equal('test/binary');
          const restoredPayload = Buffer.from(packets[0].payload);
          restoredPayload.length.should.equal(256);
          // Verify every byte survived the round-trip
          for (let i = 0; i < 256; i++) {
            restoredPayload[i].should.equal(i);
          }
          // Now save and verify the base64 re-encoding is identical
          const persistFile = n1._persistFile;
          helper.unload().then(function () {
            const saved = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
            saved.retained['test/binary'].payload.should.equal(binaryPayload.toString('base64'));
            done();
          }).catch(done);
        });
      });
    });
  });

  it('should save and restore multiple retained messages', function (done) {
    this.timeout(10000);
    const snapshotData = {
      retained: {
        'home/temperature': {
          topic: 'home/temperature',
          payload: Buffer.from('22.5').toString('base64'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        },
        'home/humidity': {
          topic: 'home/humidity',
          payload: Buffer.from('65').toString('base64'),
          qos: 1,
          retain: true,
          cmd: 'publish'
        },
        'home/status': {
          topic: 'home/status',
          payload: Buffer.from('online').toString('base64'),
          qos: 2,
          retain: true,
          cmd: 'publish'
        }
      },
      subscriptions: {}
    };
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData), 'utf8');

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1891',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        const stream = n1._broker.persistence.createRetainedStream('#');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          packets.length.should.equal(3);
          const byTopic = {};
          packets.forEach(function (p) { byTopic[p.topic] = p; });
          byTopic['home/temperature'].payload.toString().should.equal('22.5');
          byTopic['home/humidity'].payload.toString().should.equal('65');
          byTopic['home/humidity'].qos.should.equal(1);
          byTopic['home/status'].payload.toString().should.equal('online');
          byTopic['home/status'].qos.should.equal(2);
          done();
        });
      });
    });
  });

  it('should skip empty-payload retained messages (deletion signal)', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1891',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Store a retained message, then delete it with empty payload
        n1._broker.persistence.storeRetained({
          topic: 'test/delete-me',
          payload: Buffer.from('will-be-deleted'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        }).then(function () {
          // MQTT delete: retain with empty payload
          return n1._broker.persistence.storeRetained({
            topic: 'test/delete-me',
            payload: Buffer.alloc(0),
            qos: 0,
            retain: true,
            cmd: 'publish'
          });
        }).then(function () {
          // Also store one that should survive
          return n1._broker.persistence.storeRetained({
            topic: 'test/keep-me',
            payload: Buffer.from('keeper'),
            qos: 0,
            retain: true,
            cmd: 'publish'
          });
        }).then(function () {
          const persistFile = n1._persistFile;
          return helper.unload().then(function () {
            const stat = fs.statSync(persistFile);
            stat.isFile().should.be.true();
            const data = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
            // The deleted topic should not appear in the snapshot
            data.retained.should.not.have.property('test/delete-me');
            // The kept topic should be present
            data.retained.should.have.property('test/keep-me');
            done();
          });
        }).catch(done);
      });
    });
  });

  it('should warn and start with empty state on corrupt JSON file', function (done) {
    this.timeout(10000);
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    fs.writeFileSync(snapshotPath, '{ this is not valid JSON!!!', 'utf8');

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1891',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Broker should still be running with persistence enabled
        n1._persistEnabled.should.be.true();
        // Verify no retained messages were loaded
        const stream = n1._broker.persistence.createRetainedStream('#');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          packets.length.should.equal(0);
          done();
        });
      });
    });
  });

  it('should warn and start with empty state on wrong schema (array instead of object)', function (done) {
    this.timeout(10000);
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    // Valid JSON but wrong schema — array instead of object
    fs.writeFileSync(snapshotPath, JSON.stringify([1, 2, 3]), 'utf8');

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1891',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Broker should still be running with persistence enabled
        n1._persistEnabled.should.be.true();
        // Verify no retained messages were loaded
        const stream = n1._broker.persistence.createRetainedStream('#');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          packets.length.should.equal(0);
          done();
        });
      });
    });
  });
});
describe('Aedes Broker Persistence - Group 3: Filesystem Errors', function () {
  beforeEach(function (done) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aedes-test-'));
    helper.init(require.resolve('node-red'), { userDir: tmpDir });
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(function () {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        done();
      });
    });
  });
});
