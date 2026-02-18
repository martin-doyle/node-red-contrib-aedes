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
        // After bug fix 11, properties are initialized (not undefined)
        n1._persistEnabled.should.equal(false);
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

  it('should warn and fall back to pure in-memory when userDir is not writable', function (done) {
    this.timeout(10000);
    // Make tmpDir read-only
    fs.chmodSync(tmpDir, 0o444);

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1892',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Verify persistence was disabled due to write check failure
        n1._persistEnabled.should.equal(false);
        should.not.exist(n1._snapshotInterval);
        // Broker should still be running
        should.exist(n1._broker);
        // Restore write permission for cleanup
        fs.chmodSync(tmpDir, 0o755);
        done();
      }).catch(function (err) {
        fs.chmodSync(tmpDir, 0o755);
        done(err);
      });
    });
  });

  it('should warn and start with empty state when snapshot file is not readable', function (done) {
    this.timeout(10000);
    // Create a snapshot file and make it unreadable
    const snapshotData = {
      retained: {
        'test/should-not-load': {
          topic: 'test/should-not-load',
          payload: Buffer.from('should-not-load').toString('base64'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        }
      },
      subscriptions: {}
    };
    const snapshotPath = path.join(tmpDir, 'aedes-persist-n1.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData), 'utf8');
    fs.chmodSync(snapshotPath, 0o000); // Make unreadable

    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1893',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Persistence should be enabled (writable dir check passed)
        n1._persistEnabled.should.equal(true);
        // But the snapshot should not have been loaded due to read permission issue
        const stream = n1._broker.persistence.createRetainedStream('#');
        const packets = [];
        stream.on('data', function (packet) {
          packets.push(packet);
        });
        stream.on('end', function () {
          // No retained messages should be loaded
          packets.length.should.equal(0);
          // Restore read permission for cleanup
          fs.chmodSync(snapshotPath, 0o644);
          done();
        });
      }).catch(function (err) {
        fs.chmodSync(snapshotPath, 0o644);
        done(err);
      });
    });
  });

  it('should warn and continue when snapshot write fails (e.g., permission denied on close)', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1894',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        n1._persistEnabled.should.equal(true);
        should.exist(n1._persistFile);

        // Make userDir read-only before unload to simulate write failure on close
        fs.chmodSync(tmpDir, 0o555);

        helper.unload().then(function () {
          // Node should unload cleanly despite write failure
          // Restore permissions for cleanup
          fs.chmodSync(tmpDir, 0o755);
          done();
        }).catch(function (err) {
          fs.chmodSync(tmpDir, 0o755);
          done(err);
        });
      });
    });
  });

  it('should gracefully handle missing snapshot file and start with empty state', function (done) {
    this.timeout(10000);
    // Explicitly do NOT create a snapshot file
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1895',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        n1._persistEnabled.should.equal(true);
        should.exist(n1._persistFile);
        // Verify no retained messages are present
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

describe('Aedes Broker Persistence - Group 4: Configuration', function () {
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
      mqtt_port: '1896',
      persist_to_file: false,
      name: 'Aedes No Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Verify persistence is disabled
        n1._persistEnabled.should.equal(false);
        should.not.exist(n1._snapshotInterval);
        should.not.exist(n1._persistFile);
        // Store a retained message
        n1._broker.persistence.storeRetained({
          topic: 'test/no-persist',
          payload: Buffer.from('should-not-persist'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        }).then(function () {
          return helper.unload();
        }).then(function () {
          // Verify no snapshot file was created
          const files = fs.readdirSync(tmpDir).filter(function (f) {
            return f.startsWith('aedes-persist-');
          });
          files.length.should.equal(0);
          done();
        }).catch(done);
      });
    });
  });

  it('should assign separate snapshot files to different broker instances', function (done) {
    this.timeout(10000);
    const flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '1897',
        persist_to_file: true,
        name: 'Broker 1',
        wires: [[], []]
      },
      {
        id: 'n2',
        type: 'aedes broker',
        mqtt_port: '1898',
        persist_to_file: true,
        name: 'Broker 2',
        wires: [[], []]
      }
    ];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');

      Promise.all([n1._initPromise, n2._initPromise]).then(function () {
        // Both should have persistence enabled
        n1._persistEnabled.should.equal(true);
        n2._persistEnabled.should.equal(true);

        // Files should be different (based on node.id)
        const file1 = n1._persistFile;
        const file2 = n2._persistFile;
        should.exist(file1);
        should.exist(file2);
        file1.should.not.equal(file2);

        // Store different retained messages in each broker
        return Promise.all([
          n1._broker.persistence.storeRetained({
            topic: 'broker1/test',
            payload: Buffer.from('broker1-data'),
            qos: 0,
            retain: true,
            cmd: 'publish'
          }),
          n2._broker.persistence.storeRetained({
            topic: 'broker2/test',
            payload: Buffer.from('broker2-data'),
            qos: 0,
            retain: true,
            cmd: 'publish'
          })
        ]);
      }).then(function () {
        return helper.unload();
      }).then(function () {
        // Verify both files exist and contain their own data
        const file1 = path.join(tmpDir, 'aedes-persist-n1.json');
        const file2 = path.join(tmpDir, 'aedes-persist-n2.json');
        fs.existsSync(file1).should.be.true();
        fs.existsSync(file2).should.be.true();

        const data1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
        const data2 = JSON.parse(fs.readFileSync(file2, 'utf8'));

        // Each should have only its own retained message
        data1.retained.should.have.property('broker1/test');
        data1.retained.should.not.have.property('broker2/test');
        data2.retained.should.have.property('broker2/test');
        data2.retained.should.not.have.property('broker1/test');

        done();
      }).catch(done);
    });
  });

  it('should clear interval and save final snapshot on close', function (done) {
    this.timeout(10000);
    const flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '1899',
      persist_to_file: true,
      name: 'Aedes Persist Test',
      wires: [[], []]
    }];
    helper.load(aedesNode, flow, function () {
      const n1 = helper.getNode('n1');
      n1._initPromise.then(function () {
        // Verify interval is set
        should.exist(n1._snapshotInterval);

        // Store a retained message
        return n1._broker.persistence.storeRetained({
          topic: 'test/close',
          payload: Buffer.from('close-test'),
          qos: 0,
          retain: true,
          cmd: 'publish'
        }).then(function () {
          return helper.unload();
        });
      }).then(function () {
        // Verify the snapshot file was created with the retained message
        const persistFile = path.join(tmpDir, 'aedes-persist-n1.json');
        fs.existsSync(persistFile).should.be.true();
        const data = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
        data.retained.should.have.property('test/close');
        data.retained['test/close'].payload.should.equal(Buffer.from('close-test').toString('base64'));
        done();
      }).catch(done);
    });
  });
});
