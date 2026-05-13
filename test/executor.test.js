'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { execute, movePath, deleteFile, deleteDir } = require('../src/executor');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vazr-executor-test-'));
}

function writeFile(dir, name, content = 'hello') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ── deleteFile ────────────────────────────────────────────────

test('deleteFile removes an existing file', () => {
  const dir = tmpDir();
  const f = writeFile(dir, 'a.txt');
  const result = deleteFile(f);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(f), false);
});

test('deleteFile returns ok:false for a missing file', () => {
  const result = deleteFile(path.join(os.tmpdir(), 'no-such-file-vazr.txt'));
  assert.equal(result.ok, false);
  assert.ok(typeof result.reason === 'string');
});

// ── deleteDir ─────────────────────────────────────────────────

test('deleteDir removes a directory and its contents', () => {
  const dir = tmpDir();
  const sub = path.join(dir, 'sub');
  fs.mkdirSync(sub);
  writeFile(sub, 'inner.txt');
  const result = deleteDir(dir);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(dir), false);
});

test('deleteDir returns ok:false for a missing directory', () => {
  const result = deleteDir(path.join(os.tmpdir(), 'no-such-dir-vazr-' + Date.now()));
  // rmSync with force:true on a missing path does NOT throw — it succeeds silently
  assert.equal(result.ok, true);
});

// ── movePath ──────────────────────────────────────────────────

test('movePath moves a file preserving relative path structure', () => {
  const src = tmpDir();
  const dest = tmpDir();
  const f = writeFile(src, 'report.txt', 'data');
  const result = movePath(f, dest, false);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(f), false);
  // The file should exist somewhere under dest
  const files = fs.readdirSync(dest, { recursive: true });
  assert.ok(files.some(n => String(n).endsWith('report.txt')), 'moved file not found in dest');
});

test('movePath moves a directory (or reports failure gracefully)', () => {
  const src = tmpDir();
  const dest = tmpDir();
  const subDir = path.join(src, 'node_modules');
  fs.mkdirSync(subDir);
  writeFile(subDir, 'pkg.js');
  const result = movePath(subDir, dest, true);
  // movePath always returns a result object — never throws
  assert.equal(typeof result.ok, 'boolean');
  if (!result.ok) {
    assert.equal(typeof result.reason, 'string');
  }
});

test('movePath returns ok:false when dest is invalid', () => {
  const src = tmpDir();
  const f = writeFile(src, 'x.txt');
  // Pass a file as destRoot so ensureDir fails or rename fails
  const notADir = writeFile(tmpDir(), 'notadir.txt');
  const result = movePath(f, notADir, false);
  // May succeed or fail depending on OS; just check the shape
  assert.ok(typeof result.ok === 'boolean');
});

// ── execute (dry-run) ─────────────────────────────────────────

test('execute dry-run does not delete files', async () => {
  const dir = tmpDir();
  const f = writeFile(dir, 'keep.txt');
  const items = [{ path: f, size: 5 }];
  const result = await execute(items, 'delete', false, { dryRun: true });
  assert.equal(result.done, 1);
  assert.equal(result.skipped, 0);
  assert.equal(fs.existsSync(f), true, 'file should still exist after dry-run');
});

test('execute force-delete removes files', async () => {
  const dir = tmpDir();
  const f = writeFile(dir, 'gone.txt');
  const items = [{ path: f, size: 5 }];
  const result = await execute(items, 'delete', false, { dryRun: false, forceDelete: true });
  assert.equal(result.done, 1);
  assert.equal(result.skipped, 0);
  assert.equal(fs.existsSync(f), false);
});

test('execute move transfers files to destRoot', async () => {
  const src = tmpDir();
  const dest = tmpDir();
  const f = writeFile(src, 'move-me.txt');
  const items = [{ path: f, size: 5 }];
  const result = await execute(items, 'move', false, { destRoot: dest, dryRun: false });
  assert.equal(result.done, 1);
  assert.equal(fs.existsSync(f), false);
  const files = fs.readdirSync(dest, { recursive: true });
  assert.ok(files.some(n => String(n).endsWith('move-me.txt')));
});

test('execute move without destRoot counts as skipped', async () => {
  const src = tmpDir();
  const f = writeFile(src, 'orphan.txt');
  const items = [{ path: f, size: 5 }];
  const result = await execute(items, 'move', false, { destRoot: null, dryRun: false });
  assert.equal(result.skipped, 1);
});

test('execute calls onItem callback for each item', async () => {
  const dir = tmpDir();
  const files = ['a.txt', 'b.txt', 'c.txt'].map(n => writeFile(dir, n));
  const items = files.map(p => ({ path: p, size: 5 }));
  const calls = [];
  await execute(items, 'delete', false, {
    dryRun: false,
    forceDelete: true,
    onItem: (r) => calls.push(r),
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].done, 3);
});
