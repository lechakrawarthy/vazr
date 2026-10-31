'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createJournal, saveRun, listRuns, loadRun, undoRun } = require('../src/history');
const { execute } = require('../src/executor');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vazr-history-test-'));
}

// ── journal ───────────────────────────────────────────────────

test('journal records successful moves and deletes, and ignores failures and dry runs', () => {
  const j = createJournal();
  j.record({ path: '/a', size: 1 }, 'move', { ok: true, method: 'move', dest: '/x/a' });
  j.record({ path: '/b', size: 2 }, 'delete', { ok: true, method: 'trash' });
  j.record({ path: '/c', size: 4 }, 'delete', { ok: true, method: 'permanent' });
  j.record({ path: '/d', size: 8 }, 'delete', { ok: false, reason: 'locked' });
  j.record({ path: '/e', size: 16 }, 'delete', { ok: true, dryRun: true });

  const out = j.toJSON();
  assert.deepEqual(out.moves, [{ from: '/a', to: '/x/a', size: 1 }]);
  assert.equal(out.deleted.count, 2);
  assert.equal(out.deleted.bytes, 6);
  assert.equal(out.deleted.trashed, 1);
  assert.equal(out.deleted.permanent, 1);
});

test('saveRun writes nothing for an empty journal', () => {
  const dir = tmpDir();
  assert.equal(saveRun(createJournal(), {}, dir), null);
  assert.deepEqual(listRuns(dir), []);
});

test('saveRun keeps only the newest 20 runs', () => {
  const dir = tmpDir();
  for (let i = 0; i < 23; i++) {
    const j = createJournal();
    j.record({ path: '/f' + i, size: 1 }, 'delete', { ok: true, method: 'trash' });
    saveRun(j, {}, dir);
  }
  assert.equal(listRuns(dir).length, 20);
});

// ── undo ──────────────────────────────────────────────────────

test('undo moves files back where they came from, once', async () => {
  const dir = tmpDir();
  const historyDir = path.join(dir, 'history');
  const src = path.join(dir, 'work', 'video.mp4');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, 'v');

  const journal = createJournal();
  await execute([{ path: src, size: 1 }], 'move', false, {
    destRoot: path.join(dir, 'archive'),
    onItem: ({ item, result }) => journal.record(item, 'move', result),
  });
  assert.ok(!fs.existsSync(src));
  const id = saveRun(journal, {}, historyDir);

  const result = undoRun(loadRun(id, historyDir), historyDir);
  assert.equal(result.restored, 1);
  assert.ok(fs.existsSync(src), 'file should be back at its original path');
  assert.throws(() => undoRun(loadRun(id, historyDir), historyDir), /already undone/);
  assert.throws(() => loadRun(undefined, historyDir), /Nothing to undo/);
});

test('undo never overwrites something new at the original path', () => {
  const dir = tmpDir();
  const from = path.join(dir, 'a.txt');
  const to = path.join(dir, 'archive', 'a.txt');
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, 'old');
  fs.writeFileSync(from, 'new');

  const result = undoRun({ id: 'r1', moves: [{ from, to, size: 3 }], deleted: { count: 0 } }, dir);
  assert.equal(result.restored, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(fs.readFileSync(from, 'utf8'), 'new');
});
