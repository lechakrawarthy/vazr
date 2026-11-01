'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildPlan, defaultSelection, moveDestination, runPlan } = require('../src/plan');

const cats = () => [
  { key: 'temp', label: 'Temp', count: 2, defaultChecked: true, defaultAction: 'Delete', isDir: false,
    items: [{ path: '/t/a', size: 10 }, { path: '/t/b', size: 5 }] },
  { key: 'media', label: 'Media', count: 1, defaultChecked: false, defaultAction: 'Skip', isDir: false,
    items: [{ path: '/m/x.mp4', size: 100 }] },
  { key: 'empty', label: 'Empty', count: 0, defaultChecked: true, defaultAction: 'Delete', isDir: false, items: [] },
];

// ── defaultSelection ──────────────────────────────────────────

test('defaultSelection picks pre-checked categories that have items', () => {
  assert.deepEqual([...defaultSelection(cats())], ['temp']);
});

// ── buildPlan ─────────────────────────────────────────────────

test('buildPlan drops Skip categories even when checked', () => {
  const plan = buildPlan(cats(), new Set(['temp', 'media']), new Map(), false);
  assert.deepEqual(plan.map(p => p.key), ['temp']);
});

test('buildPlan leaves out excluded items and sizes what remains', () => {
  const plan = buildPlan(cats(), new Set(['temp']), new Map([['temp', new Set(['/t/a'])]]), false);
  assert.deepEqual(plan[0].items.map(i => i.path), ['/t/b']);
  assert.equal(plan[0].size, 5);
});

test('buildPlan drops a category whose items are all excluded', () => {
  const plan = buildPlan(cats(), new Set(['temp']), new Map([['temp', new Set(['/t/a', '/t/b'])]]), false);
  assert.equal(plan.length, 0);
});

// ── moveDestination ───────────────────────────────────────────

test('moveDestination files moves by category', () => {
  assert.equal(moveDestination('downloads', '/d'), path.join('/d', 'Downloads'));
  assert.equal(moveDestination('media', '/d'), path.join('/d', 'Media'));
  assert.equal(moveDestination('catchAll', '/d'), path.join('/d', 'LargeFiles'));
});

// ── runPlan ───────────────────────────────────────────────────

test('runPlan executes only the planned items', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vazr-plan-test-'));
  const keep = path.join(dir, 'keep.tmp');
  const drop = path.join(dir, 'drop.tmp');
  fs.writeFileSync(keep, 'k');
  fs.writeFileSync(drop, 'd');

  const categories = [{ key: 'temp', label: 'Temp', count: 2, defaultAction: 'Delete', isDir: false,
    items: [{ path: keep, size: 1 }, { path: drop, size: 1 }] }];
  const plan = buildPlan(categories, new Set(['temp']), new Map([['temp', new Set([keep])]]), false);
  const totals = await runPlan(plan, { forceDelete: true });

  assert.deepEqual(totals, { done: 1, skipped: 0, moved: 0 });
  assert.ok(fs.existsSync(keep), 'excluded item must survive');
  assert.ok(!fs.existsSync(drop));
});
