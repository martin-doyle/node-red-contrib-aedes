# node-red-contrib-aedes
MQTT Broker for Node-RED based on [Aedes](https://github.com/moscajs/aedes).

You can use MQTT-in and MQTT-out nodes without an external MQTT broker like Mosquitto.


[![Build Status](https://travis-ci.org/martin-doyle/node-red-contrib-aedes.svg?branch=master)](https://travis-ci.org/martin-doyle/node-red-contrib-aedes)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/standard/semistandard)\
[![Dependency Status](https://david-dm.org/martin-doyle/node-red-contrib-aedes.svg)](https://david-dm.org/martin-doyle/node-red-contrib-aedes)
[![devDependency Status](https://david-dm.org/martin-doyle/node-red-contrib-aedes/dev-status.svg)](https://david-dm.org/martin-doyle/node-red-contrib-aedes#info=devDependencies)\
[![Open Source Love](https://badges.frapsoft.com/os/mit/mit.svg?v=102)](https://github.com/ellerbrock/open-source-badge/)
[![NPM version](https://img.shields.io/npm/v/node-red-contrib-aedes.svg?style=flat)](https://www.npmjs.com/node-red-contrib-aedes)

## Background
This node was created because the original MQTT broker [node-red-contrib-mqtt-broker](https://github.com/zuhito/node-red-contrib-mqtt-broker) uses [mosca](https://github.com/moscajs/mosca) which is no longer maintained.
## Flows
Just put this node on Node-RED and hit the deploy button. The MQTT Broker will run on your Node-RED instance.

![flows](https://raw.githubusercontent.com/martin-doyle/node-red-contrib-aedes/master/flows.png)

You can set "localhost" in MQTT-in and MQTT-out properties as follows.

![setting](https://raw.githubusercontent.com/martin-doyle/node-red-contrib-aedes/master/setting.png)

