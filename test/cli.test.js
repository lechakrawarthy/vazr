'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'vazr.js');
const vazr = (...args) => spawnSync(process.execPath, [BIN, ...args, '--no-update-check'], { encoding: 'utf8', input: '' });

// ── --yes guards ──────────────────────────────────────────────
// These all fail during option validation, before any scanning starts.

test('--yes refuses to run without --only or --profile', () => {
  const r = vazr('--yes');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--yes needs --only or --profile/);
});

test('--yes refuses --force-delete', () => {
  const r = vazr('--only', 'temp', '--yes', '--force-delete');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot be combined with --force-delete/);
});

test('--only rejects unknown category keys', () => {
  const r = vazr('--only', 'temp,nope', '--yes');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown category for --only: nope/);
});

// ── history / undo ────────────────────────────────────────────

test('history and undo are subcommands, not scans', () => {
  const r = vazr('history');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout + r.stderr, /interactive terminal/);
});
