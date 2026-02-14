# Migration Plan: Aedes 0.51.x to 1.0.0

## Context

Aedes v1.0.0 is ESM-only with async broker creation and replaces `websocket-stream` with native `ws`. This plan migrates node-red-contrib-aedes from Aedes ^0.51.3 to ^1.0.0.

## Decision: Stay CJS

The project stays CommonJS (`module.exports = function(RED) {...}`). Node-RED has no native ESM support for custom nodes yet. Only `aedes` (ESM-only) needs dynamic `await import()`. All other dependencies (`aedes-persistence-mongodb` v9.4.1 = CJS, `ws` v8 = dual CJS/ESM, Node.js built-ins = both) work fine with `require()`.

## Breaking Changes

| Area | v0.51.3 (Current) | v1.0.0 (Target) |
|------|-------------------|------------------|
| Module system | CJS `require('aedes')` | ESM only -- use `await import('aedes')` |
| Broker creation | `aedes.createBroker(opts)` sync | `await Aedes.createBroker(opts)` async, named export |
| WebSocket lib | `websocket-stream` package | Native `ws` with `WebSocketServer` + `createWebSocketStream` |
| Default export | Callable function | Throws error -- must use named `{ Aedes }` |
| Subscribe event | Array (but code treats as single object -- latent bug) | Array -- must iterate |
| Unsubscribe event | Array of strings (but code treats as object -- latent bug) | Array of strings -- must iterate |

## Files to Modify

- `package.json` -- dependency updates
- `aedes.js` -- core broker logic (main work)
- `test/aedes_spec.js` -- basic TCP tests
- `test/aedes_ws_spec.js` -- WebSocket tests
- `test/aedes_secure_spec.js` -- TLS tests
- `test/aedes_qos_spec.js` -- QoS tests
- `test/aedes_retain_spec.js` -- retain tests
- `test/aedes_last_will_spec.js` -- last will tests

No changes: `aedes.html`, `locales/`, `examples/`, `icons/`

## Unchanged APIs (no migration needed)

- `broker.handle(conn, req)` -- same signature in v1
- `broker.authenticate(client, username, password, callback)` -- same in v1
- `broker.close(callback)` -- still callback-based in v1
- All broker events -- same names and signatures
- `broker.connectedClients` -- still a property
- `aedes-persistence-mongodb` v9.4.1 -- compatible (peer dep min ^9.3.1)
- `handleServerUpgrade` function -- uses standard `ws` API already

---

## TASK 0: Create migration branch

```bash
git checkout -b migrate-aedes-v1
```

All migration work happens on this branch. Merge to master after tests pass.

---

## TASK 1: Update package.json dependencies

**File:** `package.json`

### 1.1 Update aedes version
- Change `"aedes": "^0.51.3"` to `"aedes": "^1.0.0"`

### 1.2 Replace websocket-stream with ws
- Remove `"websocket-stream": "^5.5.2"`
- Add `"ws": "^8.18.0"`

### 1.3 Keep aedes-persistence-mongodb
- No change needed: `"aedes-persistence-mongodb": "^9.4.1"` is compatible

---

## TASK 2: Update imports in aedes.js

**File:** `aedes.js` lines 17-28

### 2.1 Remove aedes require
- Delete line 22: `const aedes = require('aedes');`
- Aedes will be dynamically imported inside async init (ESM-only, cannot require)

### 2.2 Replace websocket-stream require
- Delete line 28: `const ws = require('websocket-stream');`
- Add: `const { WebSocketServer, createWebSocketStream } = require('ws');`
- Note: `ws` v8 supports CJS require

---

## TASK 3: Async broker initialization pattern

**File:** `aedes.js` -- constructor `AedesBrokerNode` (line 54)

The constructor must stay synchronous (Node-RED requirement). Use "init promise" pattern.

### 3.1 Add state tracking to constructor
After synchronous config parsing (lines 54-133), add:
```javascript
node._closing = false;
node._broker = null;
node._server = null;
node._wss = null;
node._httpServer = null;
```

### 3.2 Extract async init function
Create `async function initializeBroker(node, config, aedesSettings, serverOptions)` containing all logic currently at lines 135-408:
```javascript
async function initializeBroker (node, config, aedesSettings, serverOptions) {
  const { Aedes } = await import('aedes');
  const broker = await Aedes.createBroker(aedesSettings);
  if (node._closing) { broker.close(); return; }
  node._broker = broker;
  // ... TCP/TLS server setup (TASK 3.3)
  // ... WebSocket port setup (TASK 4)
  // ... WebSocket path setup (TASK 5)
  // ... server.listen (existing logic)
  // ... authentication setup (existing logic, unchanged)
  // ... event handlers (TASK 6)
}
```

### 3.3 Call init from constructor
Replace lines 135-408 with:
```javascript
node._initPromise = initializeBroker(node, config, aedesSettings, serverOptions);
node._initPromise.catch(function (err) {
  node.error('Failed to initialize Aedes broker: ' + err.toString());
  node.status({ fill: 'red', shape: 'ring', text: 'initialization failed' });
});
```

### 3.4 TCP/TLS server creation inside initializeBroker
Move lines 136-141 into initializeBroker. No API changes needed:
```javascript
let server;
if (node.usetls) {
  server = tls.createServer(serverOptions, broker.handle);
} else {
  server = net.createServer(broker.handle);
}
node._server = server;
```

---

## TASK 4: Rewrite WebSocket port mode

**File:** `aedes.js` lines 146-188

### 4.1 Replace ws.createServer with WebSocketServer
**Old (lines 173-178):**
```javascript
wss = ws.createServer({ server: httpServer }, broker.handle);
```

**New:**
```javascript
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', function (websocket, req) {
  const stream = createWebSocketStream(websocket);
  broker.handle(stream, req);
});
node._wss = wss;
node._httpServer = httpServer;
```

### 4.2 Promisify port availability test
Wrap the testServer logic (lines 148-187) in a Promise for clean async flow inside initializeBroker. Keep same EADDRINUSE error handling.

---

## TASK 5: Rewrite WebSocket path mode

**File:** `aedes.js` lines 190-227

### 5.1 Replace ws.createServer noServer with WebSocketServer
**Old (lines 219-224):**
```javascript
node.server = ws.createServer({ noServer: true }, broker.handle);
```

**New:**
```javascript
node.server = new WebSocketServer({ noServer: true });
node.server.on('connection', function (websocket, req) {
  const stream = createWebSocketStream(websocket);
  broker.handle(stream, req);
});
```

### 5.2 handleServerUpgrade -- NO CHANGES
Function at lines 40-52 already uses standard `ws` API pattern (`handleUpgrade` + `emit('connection')`). Works as-is with `WebSocketServer`.

---

## TASK 6: Fix subscribe/unsubscribe event handlers

**File:** `aedes.js` lines 368-390

### 6.1 Fix subscribe handler (lines 368-378)
The first argument is an **array** of `{topic, qos}` objects. Iterate it:
```javascript
broker.on('subscribe', function (subscriptions, client) {
  for (const subscription of subscriptions) {
    node.send([{
      topic: 'subscribe',
      payload: { topic: subscription.topic, qos: subscription.qos, client }
    }, null]);
  }
});
```

### 6.2 Fix unsubscribe handler (lines 380-390)
The first argument is an **array of topic strings** (not objects). Iterate it:
```javascript
broker.on('unsubscribe', function (unsubscriptions, client) {
  for (const topic of unsubscriptions) {
    node.send([{
      topic: 'unsubscribe',
      payload: { topic: topic, client }
    }, null]);
  }
});
```

---

## TASK 7: Restructure close handler

**File:** `aedes.js` lines 410-452

### 7.1 Replace close handler with async-safe version
Carries over the `removed` parameter from the Node-RED 4 migration (task 2.2):
```javascript
this.on('close', async function (removed, done) {
  node._closing = true;
  if (removed) {
    node.debug('Node removed or disabled');
  } else {
    node.debug('Node restarting');
  }
  try {
    await node._initPromise;
    closeBroker(node, config, done);
  } catch (e) {
    done();
  }
});
```

### 7.2 Create closeBroker function
Extract cleanup into a standalone function. Access resources via `node._broker`, `node._server`, `node._wss`, `node._httpServer` with null checks:
```javascript
function closeBroker (node, config, done) {
  process.nextTick(function () {
    function wsClose () {
      if (node._wss) {
        node._wss.close(function () {
          if (node._httpServer) {
            node._httpServer.close(function () { done(); });
          } else { done(); }
        });
      } else { done(); }
    }
    function serverClose () {
      if (node._server) {
        node._server.close(function () {
          if (node.mqtt_ws_path !== '' && node.fullPath) {
            delete listenerNodes[node.fullPath];
            if (node.server) {
              node.server.close(function () { wsClose(); });
            } else { wsClose(); }
          } else { wsClose(); }
        });
      } else { wsClose(); }
    }
    if (node._broker) {
      node._broker.close(function () { serverClose(); });
    } else { serverClose(); }
  });
}
```

---

## TASK 8: Update test files for async init

**Files:** all 6 files in `test/`

### 8.1 Add _initPromise wait pattern
In every test that connects an MQTT client, use the async `helper.load()` (available since `node-red-node-test-helper` v0.3.5) and `await` the init promise:
```javascript
await helper.load(aedesNode, flow);
const n1 = helper.getNode('n1');
await n1._initPromise;
// ... existing test logic ...
```

This replaces the nested callback + `.then()` pattern with flat async/await. Each `it()` callback must be declared `async`.

### 8.2 Tests that do NOT need changes
Tests that only check `n1.name` or node existence ("should be loaded") work without waiting -- the name is set synchronously in the constructor.

### 8.3 Test files to update
- `test/aedes_spec.js` -- all tests except "should be loaded"
- `test/aedes_ws_spec.js` -- all tests except "should be loaded"
- `test/aedes_secure_spec.js` -- all tests except "should be loaded"
- `test/aedes_qos_spec.js` -- all tests
- `test/aedes_retain_spec.js` -- all tests
- `test/aedes_last_will_spec.js` -- all tests except "should be loaded"

---

## TASK 9: Install and verify

### 9.1 Install new dependencies
```bash
npm install
```

### 9.2 Run full test suite
```bash
npm test
```

### 9.3 Verify all scenarios
- TCP plain connection
- TCP with TLS (port 8883)
- WebSocket via standalone port
- WebSocket via Node-RED path
- Secure WebSocket (WSS) on port
- Secure WebSocket (WSS) on path
- QoS 1 and QoS 2 persistence
- Retained messages
- Last will and testament
- Authentication (valid + invalid credentials)
- Multiple brokers on different ports
- Port conflict detection

---

## Legacy branch relevance (v11, v0.15.x)

Both legacy branches use Aedes 0.49.0. We checked whether Tasks 6 and 7.1 also apply there:

- **Task 6 (subscribe/unsubscribe handlers) — YES, relevant for both branches.**
  Both `v11` and `v0.15.x` have the same latent bug: the handlers treat the first argument as a single object, but the Aedes API (even in 0.49.0) passes an array. This fix should be backported.

- **Task 7.1 (close handler `removed` parameter) — NO, not relevant.**
  Both legacy branches use `this.on('close', function (done) {...})` with one parameter. Node-RED handles this via arity checking — if the function declares 1 param, Node-RED passes only `done`, so the handler works correctly on all Node-RED versions. The `removed` param is a nice-to-have, and the async-safe parts (`_initPromise`, `_closing`) only apply to aedes v1's async init.
