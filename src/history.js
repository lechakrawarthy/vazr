'use strict';

const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./config');

const HISTORY_DIR = path.join(APP_DIR, 'history');
const KEEP_RUNS = 20;
// Moves are recorded in full (undo needs every one). Deletes can be 100k temp
// files, so only the first few thousand paths are kept, plus exact totals.
const MAX_DELETE_PATHS = 2000;

/**
 * Collects what a run actually did, item by item.
 * @returns {{ record: (item: object, action: string, result: object) => void, isEmpty: () => boolean, toJSON: () => object }}
 */
function createJournal() {
  const moves = [];
  const deletedPaths = [];
  const deleted = { count: 0, bytes: 0, trashed: 0, permanent: 0 };

  return {
    record(item, action, result) {
      if (!result.ok || result.dryRun) return;
      if (action === 'move') {
        moves.push({ from: item.path, to: result.dest, size: item.size || 0 });
        return;
      }
      deleted.count++;
      deleted.bytes += item.size || 0;
      if (result.method === 'permanent') deleted.permanent++; else deleted.trashed++;
      if (deletedPaths.length < MAX_DELETE_PATHS) deletedPaths.push(item.path);
    },
    isEmpty: () => moves.length === 0 && deleted.count === 0,
    toJSON: () => ({ moves, deleted: { ...deleted, paths: deletedPaths, truncated: deleted.count > deletedPaths.length } }),
  };
}

function runFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
}

/**
 * Writes a finished run to the history folder and keeps only the newest KEEP_RUNS.
 * @returns {string | null} the run id, or null when nothing was done
 */
function saveRun(journal, meta, dir = HISTORY_DIR) {
  if (journal.isEmpty()) return null;
  fs.mkdirSync(dir, { recursive: true });
  const finishedAt = new Date().toISOString();
  let id = finishedAt.replace(/[:.]/g, '-');
  while (fs.existsSync(path.join(dir, id + '.json'))) id += '-1';
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ id, finishedAt, ...meta, ...journal.toJSON() }, null, 2));

  const files = runFiles(dir);
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_RUNS))) fs.unlinkSync(path.join(dir, old));
  return id;
}

/** Newest first. Unreadable files are skipped. */
function listRuns(dir = HISTORY_DIR) {
  const runs = [];
  for (const f of runFiles(dir).reverse()) {
    try { runs.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* skip */ }
  }
  return runs;
}

/**
 * @param {string} [id] - defaults to the newest run that has not been undone
 */
function loadRun(id, dir = HISTORY_DIR) {
  const runs = listRuns(dir);
  const run = id ? runs.find(r => r.id === id) : runs.find(r => !r.undoneAt);
  if (!run) throw new Error(id ? `No run "${id}". See \`vazr history\`.` : 'Nothing to undo.');
  return run;
}

function moveBack(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

/**
 * Moves every file a run moved back to where it came from. Never overwrites: if
 * something now exists at the original path, that item is reported, not restored.
 * Deletes can't be reversed here; the result says where they went.
 * @returns {{ restored: number, failed: Array<{ path: string, reason: string }>, deleted: object }}
 */
function undoRun(run, dir = HISTORY_DIR) {
  if (run.undoneAt) throw new Error(`Run ${run.id} was already undone at ${run.undoneAt}.`);
  let restored = 0;
  const failed = [];
  for (const m of [...run.moves].reverse()) {
    try {
      if (!fs.existsSync(m.to)) throw new Error('no longer at ' + m.to);
      if (fs.existsSync(m.from)) throw new Error('something already exists at the original path');
      moveBack(m.to, m.from);
      restored++;
    } catch (err) {
      failed.push({ path: m.from, reason: err.message });
    }
  }
  const file = path.join(dir, run.id + '.json');
  fs.writeFileSync(file, JSON.stringify({ ...run, undoneAt: new Date().toISOString() }, null, 2));
  return { restored, failed, deleted: run.deleted };
}

module.exports = { HISTORY_DIR, createJournal, saveRun, listRuns, loadRun, undoRun };
