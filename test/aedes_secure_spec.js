/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
const aedesNode = require('../aedes.js');
// const mqttNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/10-mqtt.js');
const tlsConfigNode = require('../node_modules/node-red/node_modules/@node-red/nodes/core/network/05-tls.js');
const mqtt = require('mqtt/mqtt.js');
const should = require('should');

helper.init(require.resolve('node-red'));

describe('Secure MQTT Broker Node Websocket', function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });
  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(done);
    });
  });

  it('should be loaded', function (done) {
    var flow = [{
      id: 'n1',
      type: 'aedes broker',
      mqtt_port: '8883',
      usetls: true,
      certdata: `
-----BEGIN CERTIFICATE-----
MIICrTCCAhYCCQC3zJs/9Fnk+jANBgkqhkiG9w0BAQUFADCBmjELMAkGA1UEBhMC
VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28x
ITAfBgNVBAoTGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDETMBEGA1UEAxMKU2Ft
aXIgTmFpazEmMCQGCSqGSIb3DQEJARYXc2FtaXJAY2xlbWVudGluZWluYy5jb20w
HhcNMTMwNzAxMjIyMDI5WhcNMTMwNzMxMjIyMDI5WjCBmjELMAkGA1UEBhMCVVMx
EzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28xITAf
BgNVBAoTGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDETMBEGA1UEAxMKU2FtaXIg
TmFpazEmMCQGCSqGSIb3DQEJARYXc2FtaXJAY2xlbWVudGluZWluYy5jb20wgZ8w
DQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBAJ5K09opBDsvjWtkFQkmmWLnHqoQadC4
4zjiSO012Kz0SwPZDe6ymuSPk05p6Ezp2kkC118tAvXHiYmc/UEIg19AaM8hEo9m
IdUQjofR5DRiECP25wpJjPv4zhu09MdMmTNejSBpdIRdkpTV4TdRKadG5K5+hcBU
8xfWQ2VvSrh9AgMBAAEwDQYJKoZIhvcNAQEFBQADgYEALrgLe5Wspn7lpPXFCT5U
ptXHlLJHWbkD3Ub6mxTn8b/ZwqFZYFSxeGohWIyJqW+EY1F8byUA20jwkE5aOqq4
hAvPaHua1a4lbtxRYXlksPJmUhXSe34XP15bHKQM5rk6ZjZuvXoCNqAfVEEC5PiM
dLMrYBUgn+3BGsMOToTCSxg=
-----END CERTIFICATE-----      
      `,
      keydata: `
-----BEGIN RSA PRIVATE KEY-----
MIICWwIBAAKBgQCeStPaKQQ7L41rZBUJJpli5x6qEGnQuOM44kjtNdis9EsD2Q3u
sprkj5NOaehM6dpJAtdfLQL1x4mJnP1BCINfQGjPIRKPZiHVEI6H0eQ0YhAj9ucK
SYz7+M4btPTHTJkzXo0gaXSEXZKU1eE3USmnRuSufoXAVPMX1kNlb0q4fQIDAQAB
AoGAd2TJVowJfPrpGE9s7nIGz+qz3mJy7dQGzykfCIzM2eeJjWVydNCStEL3QPXx
GdJpqxhRiqBQ00GmI/4dp6fcLhRmGvPDRBDaMgz09fqX7Tx+nWwHeGw61/OrYVZ7
aPKkaVB/moiB4EqWZs+knIYsOXQCixte/8ix//zlH2p3RgECQQDRYntnleyzARlb
zxKEnB9GKwpLQYIijlMVIWB9+k3ZI+zlB58s0PP2xkLGZtmIhRgMDoeje0YZOcER
AgjnQGyxAkEAwYhsM01dMv3qnCSoeJZjJDPZmuIfMHco6vMDYJd1Rs89/1Z3IJFJ
/N3hQUKJpPeWpQtFPC9VnDTsTKpoQidLjQJAJeHMc9xDG8u6G8smDYn1eot07FKo
ybm4PF1yiLhNd1ixlmo/mSsgyGfsUtruxm1WAXBrh99Yul2hmYMluzkDsQJACCpG
Tl/MN9OIq2/Mf9Hwet2JJ8S0hinw2wDHurKJKyShO/2c5w3aLkX6M/OntQMRIwN3
t1NT7FQ7R/zEi033HQJABZxlaVmEwwr8xRzI31EDL8PVuyFEUrTsxRlJ0BZ5xDYb
saXezXDtSSbSuqJtqe4yEtAUwljxzpxMK72es4ZRHw==
-----END RSA PRIVATE KEY-----      
      `,
      name: 'Aedes 8883'
    }];
    helper.load(aedesNode, flow, function () {
      var n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Aedes 8883');
      done();
    });
  });

  it('a subscriber should receive a message from an external publisher', function (done) {
    this.timeout(10000); // have to wait for the inject with delay of 10 seconds
    var flow = [
      {
        id: 'n1',
        type: 'aedes broker',
        mqtt_port: '8883',
        name: 'Aedes 8883',
        usetls: true,
        certdata: `
-----BEGIN CERTIFICATE-----
MIIDMDCCAhgCFHobDhtnf5oUTS3EEBNrJuh6y199MA0GCSqGSIb3DQEBCwUAMFUx
CzAJBgNVBAYTAkRFMQ8wDQYDVQQIDAZCZXJsaW4xEDAOBgNVBAcMB0JlcmxpbG4x
DjAMBgNVBAoMBWFlZGVzMRMwEQYDVQQDDApMdXR6LVdpbjEwMB4XDTIwMDIyMjIy
NTA1OFoXDTMwMDIxOTIyNTA1OFowVDELMAkGA1UEBhMCREUxDzANBgNVBAgMBkJl
cmxpbjEPMA0GA1UEBwwGQmVybGluMQ4wDAYDVQQKDAVhZWRlczETMBEGA1UEAwwK
THV0ei1XaW4xMDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKEQqmZT
ZUlpTSF2mgTaIr/s/3/bWJB2SvYVQWZej8xkIJ/38Bf+RHmQ7daipQ4i/oWKTtWB
GnVzj/8QmuDmsZOyMvswTgqTf0mDnHLoqK6vZabnorKFK52vxxHYHe1BKlukXXBP
n8KPNc8LmzSg0KjpwT1dXrI2qUTNkyadd35GZvsY6qi1nuOEL/bBWclC53RgHQtM
o3FlATmjcq8/zW6UsOkWXhK71JQWL06+701yIgT6lkgl6Rp+9hYyt3vVUK/mka1L
ttAEYTWJinRQornRBigb8OzgQVS9Gd2so0tdF+9vAiWDFvee/6PbDdVWqUEpV+Vm
pV+UZnQXqer7bRUCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEADZnEnlww3nI66Yf9
xIuJgDkpbCvqAIfaiNgxVEBfrYkcO7n75MSGNW6PmdX/1aE5uycGIF3fKFL+63YR
jJfxNYsgrIe4zv/j+EJ06oiTo5imUIKs0Wv/fmUySIeX/ojR/Rm5xIkPsW4SwNgO
8JPRLQyeT4z6dIrYIfcQ+bd+g1TQ2DJHKIUu/52ffqk4J/XMZuR/LKJwHDe6HbTR
JyMWA1Vsf+bdOy2bOhen+HW+u06Snt81VIXdzCNr2qR8uRXMiRmdZIu5onR9ipXs
eYF5z3ZS/LAhGHvcilg6ZrGV+i0irTvxs5tArBqtarmrechdTJOzsXSWYgv4/B3h
q7hGRQ==
-----END CERTIFICATE-----
      `,
        keydata: `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAoRCqZlNlSWlNIXaaBNoiv+z/f9tYkHZK9hVBZl6PzGQgn/fw
F/5EeZDt1qKlDiL+hYpO1YEadXOP/xCa4Oaxk7Iy+zBOCpN/SYOccuiorq9lpuei
soUrna/HEdgd7UEqW6RdcE+fwo81zwubNKDQqOnBPV1esjapRM2TJp13fkZm+xjq
qLWe44Qv9sFZyULndGAdC0yjcWUBOaNyrz/NbpSw6RZeErvUlBYvTr7vTXIiBPqW
SCXpGn72FjK3e9VQr+aRrUu20ARhNYmKdFCiudEGKBvw7OBBVL0Z3ayjS10X728C
JYMW957/o9sN1VapQSlX5WalX5RmdBep6vttFQIDAQABAoIBAEZ0f9WbDWd7hJ3q
v5z3vtOt3GYVkTxAQrI6wg0BuG10L0FKt+AG/fUfjKqjIwh4DlZkFfAXNXfDQW4V
2Wof//XXsa1nh/vgYYHK7JjnZUJkv1avZOAqmNW1mqMXop+yLdFAqQ8EBaKZ+rPD
I/V1k1EQT9OEEHRsrMbIFmKB50940o9zWSdxvSZ8A4WDjjt2f7ksEKx6tB+kEqJd
WtehBOslPkvH5DiRFHOZrMt0HvycGpXUJ8y3N4Kd9wIINXn/xaOrcKImcb0Lr3ks
hZ5JnVmmyhISyvDepedUUIZaIiDntV810DIOIObqcGGEOjD29Pr1MpHuUI4gerPL
Uonv9tECgYEA1pQi8e1tWgolCMPJMSdk+VyjrfRqdStnCwdEpe3L7s1jhKMPipVa
NlwWpYM7+mMrhXRq72krxggBW1cvvSBerEVsv/mHHwFym34Vl22AYZ1DWLZFQG+p
3xqZtofiahPGsJd9Dyd4o5w1P6Vw0nC0ROzbHiSMY6kdRdatU4c7tFcCgYEAwCgK
ymD1SatRtGtg2qp3/pkT0pAMgLFKfN9St0eUZ67abwYR0+DrV6rH63oih1Jn1nLI
UuMhGs4A7gH+BHI0mb2oCYRplM+g11qwpatX4jZFIlic9UBwlNLaoRHmS2gmOY+j
g9XM2Byf3vZ62BU4XBjHHyZ3SsgQ0exD9EHvpnMCgYBRleVrgtCvCWhnWrmmfMoB
nd2GCIZpomT9ZngNdsqxM1qBVdZU5NB2FrFtoOYvH4GurkLyYFSKaQTLC+1UxXf5
nDPrEh70BQLkaB4hgzrq4nZ2xmayR0KZV23WXvgRSQ+kmRStrF5MJtqAJpEtEjkY
c84kOdU/F0/P+/3O4n4q5QKBgQCrPUPYdC1C+GQ4dxR56T5D6eCrXWl26geqXk3V
PPm4qC7Kj8slWSQBHRVJ+K56j2ovxlxU2UmwHHLhp27aQXg0pbnwuUpprdn08EHJ
cXdBBQH5CKTfPgzV402oCk6DVo3x79pU6xvAX0ntJRP2KnruP7p7PQlD4CR1Hqq0
KmpJlwKBgB4TOdHhXzZOPBNRoKP6ezF7IbkC6TAwnATroOuZUDvi1dHgbFa/TW1c
NJSQG7R+gtR8w36B7maFLY3TgmHx8+pqettNxIyuOnMly1zl/Tn33yT3Vdoqcf99
k9moKWbIsfi52pUI2sCMY/6StrZGgevNkK+KQ5JxAiKsnsw7tpjt
-----END RSA PRIVATE KEY----- 
      `,
        wires: [
          ['n2']
        ]
      },
      {
        id: 'n2',
        type: 'helper'
      }
    ];

    var TRUSTED_CA_LIST = `
-----BEGIN CERTIFICATE-----
MIIDizCCAnOgAwIBAgIUciga2CIxd5Mn6G3AHXUh2GWeVO4wDQYJKoZIhvcNAQEL
BQAwVTELMAkGA1UEBhMCREUxDzANBgNVBAgMBkJlcmxpbjEQMA4GA1UEBwwHQmVy
bGlsbjEOMAwGA1UECgwFYWVkZXMxEzARBgNVBAMMCkx1dHotV2luMTAwHhcNMjAw
MjIyMjI0ODQyWhcNMjkxMjMxMjI0ODQyWjBVMQswCQYDVQQGEwJERTEPMA0GA1UE
CAwGQmVybGluMRAwDgYDVQQHDAdCZXJsaWxuMQ4wDAYDVQQKDAVhZWRlczETMBEG
A1UEAwwKTHV0ei1XaW4xMDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AOIE77YVRPBO4eYZG9WSResS2L9KI6JfXxCfKjXwY6VUGG9G2d3lpOvToR0QfhpW
js7C9+fseKxEM/Rm7quQppRvkkIvuJDt7XcnzOEOvTgt+M4u8TXatdcDkvcR2pvW
HFvYDptWzYL3N/7IBHGyW0zakWW+00StxfRLgHDuE6aFUGg/oMK11I4BjMG3wUeJ
wQg9vO9wjnTqp1VTmTs+z5XJ2NN8ipd28tzfuqBeQRW+qAgAvXvgkHI3CgT0wAKb
NzE6I4UeXZGy6iGNpaHlf9rV8kTem2h6qx8+YjP+N7Z7lAh4F4KjSOmN8q1MT9nV
14wc/AWI3MHWVJc0VKencM0CAwEAAaNTMFEwHQYDVR0OBBYEFM34Q3krtneKJs1U
waD6jy9vGrXnMB8GA1UdIwQYMBaAFM34Q3krtneKJs1UwaD6jy9vGrXnMA8GA1Ud
EwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBABKJfQ94lCly1OgmsUjBU37L
UebGcWFv75ugPMDqi1KZMuxU5Ce0NcwCsAaKd+uZAWGfNdSfMZq18wk6vQMJl9Y3
/I8++l/pir7zXY/Nyxn5/J6hs4gX+w9jPGgmyKBqKI2g39jL6rR/D7Qoe3GvJ4LB
aBgUX34XEmhDqUidQbUXmtN3bPNdH/1is5eW5AaSCx6u25KpByYlSYxFSpcH2btK
borI6Ih8yD6CVQcVWWJi/IPga5RmxtqioVS5MOemvjk7TvXn+tGHUyGGrUvJVqCK
YRBpdnEcZEKrWlcT0jUVCDpkNwMC13YRFm8ghC6fijiLRlR44SD13F5ZVqV5aQ4=
-----END CERTIFICATE-----
    `;

    var options = {
      port: 8883,
      host: 'Lutz-Win10',
      rejectUnauthorized: true,
      ca: TRUSTED_CA_LIST,
      protocol: 'mqtts'
    };

    helper.load([tlsConfigNode, aedesNode], flow, function () {
      var client = mqtt.connect(options);
      client.on('error', function (err) {
        console.log('Error: ', err.toString());
      });
      client.on('connect', function () {
        // console.log('External client connected');
      });

      client.subscribe('test8883');
      client.publish('test8883', 'test');

      var n2 = helper.getNode('n2');
      n2.on('input', function (msg) {
        console.log('Broker received message with topic ' + msg.topic);
        if (msg.topic === 'subscribe') {
          console.log('Client subscribed');
          client.publish('test8883', 'test');
        }
      });
      client.on('message', function (topic, message) {
        should(topic.toString()).equal('test8883');
        should(message.toString()).equal('test');
        client.end();
        done();
      });
    });
  });
});
