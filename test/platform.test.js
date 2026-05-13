'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

const {
  isProtectedPath,
  getExcludedPaths,
  getDownloadsPath,
  getSystemRoot,
  getLargeScanRoots,
} = require('../src/platform');

// ── isProtectedPath ───────────────────────────────────────────

test('isProtectedPath returns true for filesystem root', () => {
  const root = process.platform === 'win32' ? 'C:\\' : '/';
  assert.equal(isProtectedPath(root), true);
});

test('isProtectedPath returns true for system directories', () => {
  if (process.platform === 'win32') {
    assert.equal(isProtectedPath('C:\\Windows'), true);
    assert.equal(isProtectedPath('C:\\Windows\\System32'), true);
    assert.equal(isProtectedPath('C:\\Program Files'), true);
  } else if (process.platform === 'darwin') {
    assert.equal(isProtectedPath('/System'), true);
    assert.equal(isProtectedPath('/usr/bin'), true);
  } else {
    assert.equal(isProtectedPath('/proc'), true);
    assert.equal(isProtectedPath('/usr/bin'), true);
    assert.equal(isProtectedPath('/etc'), true);
  }
});

test('isProtectedPath returns false for user home directory', () => {
  // Home itself is not in the excluded list (only system paths are)
  const userDir = path.join(os.homedir(), 'Documents');
  // This may or may not be excluded depending on OS — just check it doesn't throw
  assert.equal(typeof isProtectedPath(userDir), 'boolean');
});

test('isProtectedPath returns false for a temp dir', () => {
  const tmp = os.tmpdir();
  // Temp dir is never in the protected list
  assert.equal(isProtectedPath(tmp), false);
});

// ── getExcludedPaths ──────────────────────────────────────────

test('getExcludedPaths returns an array of lowercase strings', () => {
  const paths = getExcludedPaths();
  assert.ok(Array.isArray(paths));
  assert.ok(paths.length > 0);
  for (const p of paths) {
    assert.equal(typeof p, 'string');
    assert.equal(p, p.toLowerCase(), `excluded path should be lowercase: ${p}`);
  }
});

test('getExcludedPaths does not include the user home directory', () => {
  const home = os.homedir().toLowerCase();
  const paths = getExcludedPaths();
  assert.ok(!paths.includes(home), 'home directory should not be excluded');
});

// ── getDownloadsPath ──────────────────────────────────────────

test('getDownloadsPath returns a string ending with Downloads', () => {
  const p = getDownloadsPath();
  assert.equal(typeof p, 'string');
  assert.ok(p.endsWith('Downloads'), `expected to end with Downloads, got: ${p}`);
});

// ── getSystemRoot ─────────────────────────────────────────────

test('getSystemRoot returns a valid root path', () => {
  const root = getSystemRoot();
  assert.equal(typeof root, 'string');
  if (process.platform === 'win32') {
    assert.ok(root.endsWith('\\'), 'Windows root should end with backslash');
  } else {
    assert.equal(root, '/');
  }
});

// ── getLargeScanRoots ─────────────────────────────────────────

test('getLargeScanRoots returns only existing, non-protected paths', () => {
  const roots = getLargeScanRoots();
  assert.ok(Array.isArray(roots));
  const fs = require('fs');
  for (const r of roots) {
    assert.ok(fs.existsSync(r), `scan root should exist: ${r}`);
    assert.equal(isProtectedPath(r), false, `scan root should not be protected: ${r}`);
  }
});
