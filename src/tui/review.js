'use strict';

const readline = require('readline');
const { ESC, tok } = require('./tokens');
const { enableRaw, disableRaw, nextKey } = require('./input');

/**
 * Run the interactive review screen. Returns selected keys + action map, or
 * null if the user cancelled.
 * @param {import('./screen').Screen} screen
 * @param {string} version
 * @param {Array<object>} categories
 * @param {{ dryRun: boolean, forceDelete: boolean, destAvailable: boolean }} flags
 * @returns {Promise<{ selectedKeys: string[], actionMap: object } | null>}
 */
function sortCategories(categories, sortBy) {
  const arr = [...categories];
  if (sortBy === 'name') return arr.sort((a, b) => a.label.localeCompare(b.label));
  if (sortBy === 'count') return arr.sort((a, b) => b.count - a.count);
  // default: size descending
  return arr.sort((a, b) => b.size - a.size);
}

async function runReview(screen, version, categories, flags) {
  const visible = categories.filter(c => c.count > 0);
  if (visible.length === 0) return null;

  const sorted = sortCategories(visible, flags.sortBy || 'size');
  // Track current sort state so user can toggle (S key cycles through modes)
  let currentSort = flags.sortBy || 'size';
  const SORT_MODES = ['size', 'name', 'count'];

  let cursorIdx = 0;
  const checked = new Set(
    sorted.filter(c => c.defaultChecked !== false).map(c => c.key)
  );

  process.stdout.write(ESC.altOn + ESC.hideCursor);
  enableRaw();

  const render = () => {
    screen.renderReview(version, sorted, cursorIdx, checked, { ...flags, currentSort });
    screen.flush();
  };

  render();

  while (true) {
    const key = await nextKey();

    if (key === '\u0003' || key === 'q' || key === 'Q') {
      disableRaw();
      process.stdout.write(ESC.altOff + ESC.showCursor);
      return null;
    }

    if (key === '\u001b[A' || key === 'k') cursorIdx = Math.max(0, cursorIdx - 1);
    else if (key === '\u001b[B' || key === 'j') cursorIdx = Math.min(sorted.length - 1, cursorIdx + 1);
    else if (key === ' ') {
      const cat = sorted[cursorIdx];
      if (checked.has(cat.key)) checked.delete(cat.key);
      else checked.add(cat.key);
    }
    else if (key === 'd' || key === 'D') {
      sorted[cursorIdx].defaultAction = 'Delete';
    }
    else if ((key === 'm' || key === 'M') && flags.destAvailable && !sorted[cursorIdx].isDir) {
      sorted[cursorIdx].defaultAction = 'Move';
    }
    else if (key === 's' || key === 'S') {
      const nextIdx = (SORT_MODES.indexOf(currentSort) + 1) % SORT_MODES.length;
      currentSort = SORT_MODES[nextIdx];
      const focusKey = sorted[cursorIdx] ? sorted[cursorIdx].key : null;
      const resorted = sortCategories(visible, currentSort);
      sorted.length = 0;
      sorted.push(...resorted);
      cursorIdx = focusKey ? Math.max(0, sorted.findIndex(c => c.key === focusKey)) : 0;
    }
    else if (key === '\r' || key === '\n') {
      if (checked.size === 0) continue;
      break;
    }

    render();
  }

  // Build plan
  const selectedKeys = [...checked];
  const plan = selectedKeys.map(k => {
    const cat = sorted.find(c => c.key === k);
    const action = (cat.defaultAction === 'Move' && flags.destAvailable) ? 'move' : 'delete';
    return { key: k, label: cat.label, size: cat.size, action };
  });

  // Confirm screen
  screen.renderConfirm(version, plan);
  screen.flush();

  let confirmed = false;
  while (true) {
    const key = await nextKey();
    if (key === 'y' || key === 'Y') { confirmed = true; break; }
    if (key === 'n' || key === 'N' || key === 'q' || key === '\u0003') break;
  }

  disableRaw();
  process.stdout.write(ESC.altOff + ESC.showCursor);

  if (!confirmed) return null;

  const actionMap = {};
  for (const item of plan) actionMap[item.key] = item.action;
  return { selectedKeys, actionMap };
}

/**
 * Show the force-delete confirmation gate. Returns true if the user typed DELETE.
 * @param {import('./screen').Screen} screen
 * @param {string} version
 * @returns {Promise<boolean>}
 */
async function confirmForceDelete(screen, version) {
  process.stdout.write(ESC.altOn + ESC.hideCursor);
  screen.renderForceDelete(version);
  process.stdout.write(ESC.altOff + ESC.showCursor);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve =>
    rl.question('\n  ' + tok.dangerBold('Type DELETE to confirm: '), resolve)
  );
  rl.close();
  return answer.trim() === 'DELETE';
}

module.exports = { runReview, confirmForceDelete };
