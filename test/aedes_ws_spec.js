const should = require("should");
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');

helper.init(require.resolve('node-red'));

describe('MQTT Broker Node', function () {
    beforeEach(function (done) {
        helper.startServer(done);
        console.log('Test: Start Server');
    });
    afterEach(function(done) {
        helper.unload().then(function() {
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
});
