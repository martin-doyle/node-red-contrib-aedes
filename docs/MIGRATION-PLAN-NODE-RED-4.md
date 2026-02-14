# Migration Plan: Node-RED 4 Best Practices

## Context

The project was started with Node-RED v2 but `package.json` already requires `>=3.0.0`. Node-RED v3 went EOL June 2025. Only v4 is actively maintained. This plan aligns the project with Node-RED v4 best practices while keeping the changes minimal and low-risk.

## Recommended Order: Run this BEFORE the Aedes v1 migration

Rationale:
- These changes are small, low-risk, and independently testable
- They establish a clean, verified baseline before the larger Aedes rewrite
- The close handler update to `(removed, done)` carries over naturally into the Aedes migration's restructured close handler

---

## TASK 1: Update `node-red` version field in package.json

**File:** `package.json` line 21

### 1.1 Keep minimum Node-RED version at >=3.0.0
- No change needed -- `"version": ">=3.0.0"` already includes v4
- Keeps broader compatibility for users still on v3

---

## TASK 2: Update close handler to use `removed` parameter

**File:** `aedes.js` line 410

### 2.1 Add `removed` parameter
Available since Node-RED v0.17. Compatible with v2, v3, and v4.

**Current:**
```javascript
this.on('close', function (done) {
```

**New:**
```javascript
this.on('close', function (removed, done) {
```

### 2.2 Optional: use `removed` for cleaner logging
```javascript
this.on('close', function (removed, done) {
  if (removed) {
    node.debug('Node removed or disabled');
  } else {
    node.debug('Node restarting');
  }
  // ... existing cleanup ...
```

Note: The close handler has a **15-second timeout** enforced by Node-RED. The current nested callback chain should stay well within that, but keep it in mind.

---

## TASK 3: Add missing dev dependencies to package.json

**File:** `package.json`

### 3.1 Add semistandard and snazzy to devDependencies
The test script uses `semistandard` and `snazzy` but they're **not listed in devDependencies**. They only work if globally installed, which breaks `npm test` for other contributors.

Add to `devDependencies`:
```json
"semistandard": "^17.0.0",
"snazzy": "^9.0.0"
```

### 3.2 Alternative: Replace with ESLint (optional, larger scope)
`semistandard` was [last updated Aug 2024](https://github.com/standard/semistandard) and is not actively maintained. ESLint is the modern standard. However, this is a larger change -- consider deferring to a separate effort.

---

## TASK 4: Verify test helper version

**File:** `package.json` line 12

### 4.1 Already up to date
`node-red-node-test-helper` v0.3.6 (Jan 2025) is the latest. Your `^0.3.6` is correct. No change needed.

Notable: v0.3.5 added async `start`/`stop`/`load` support, which will be useful during the Aedes migration when tests need to `await _initPromise`.

---

## TASK 5: Run tests and verify

### 5.1 Install and test
```bash
npm install
npm test
```

### 5.2 Verify all existing tests still pass
No functional changes were made -- only the close handler signature and package metadata.

---

## Summary of changes

| Task | Risk | Effort | Backward compat |
|------|------|--------|-----------------|
| node-red version field | None | Trivial | v2+ (if >=3.0.0) or v4+ |
| close(removed, done) | None | Trivial | v2+ (since v0.17) |
| Add semistandard/snazzy to devDeps | None | Trivial | All versions |
| Test helper version | None | None | Already current |
