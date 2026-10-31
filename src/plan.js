'use strict';

const path = require('path');
const executor = require('./executor');
const { resolveAction } = require('./tui/tokens');

const MOVE_SUBDIRS = { downloads: 'Downloads', media: 'Media' };

/**
 * Where a moved category lands under the destination root.
 * @param {string} key - category key
 * @param {string} destRoot
 * @returns {string}
 */
function moveDestination(key, destRoot) {
  return path.join(destRoot, MOVE_SUBDIRS[key] || 'LargeFiles');
}

/**
 * The categories vazr pre-selects. The review screen starts from this, and
 * headless runs (`--yes`) clean exactly this.
 * @param {Array<object>} categories
 * @returns {Set<string>}
 */
function defaultSelection(categories) {
  return new Set(categories.filter(c => c.count > 0 && c.defaultChecked !== false).map(c => c.key));
}

/**
 * Turns a selection into the concrete work to do. Checked categories whose action
 * resolves to nothing (Skip), and categories with every item left out, drop out.
 * @param {Array<object>} categories
 * @param {Set<string>} checked - selected category keys
 * @param {Map<string, Set<string>>} excluded - per category key, item paths left out
 * @param {boolean} destAvailable
 * @returns {Array<{ key: string, label: string, action: 'delete'|'move', items: object[], isDir: boolean, size: number }>}
 */
function buildPlan(categories, checked, excluded, destAvailable) {
  const plan = [];
  for (const cat of categories) {
    if (!checked.has(cat.key)) continue;
    const action = resolveAction(cat.defaultAction, destAvailable);
    if (!action) continue;
    const skip = excluded.get(cat.key);
    const items = skip && skip.size > 0 ? cat.items.filter(i => !skip.has(i.path)) : cat.items;
    if (items.length === 0) continue;
    const size = items.reduce((s, i) => s + (i.size || 0), 0);
    plan.push({ key: cat.key, label: cat.label, action, items, isDir: cat.isDir, size });
  }
  return plan;
}

/**
 * Executes a plan category by category.
 * @param {ReturnType<typeof buildPlan>} plan
 * @param {{ destRoot?: string, dryRun?: boolean, forceDelete?: boolean, logger?: object, journal?: object,
 *           onProgress?: (label: string, action: string, done: number, total: number) => void }} opts
 * @returns {Promise<{ done: number, skipped: number, moved: number }>}
 */
async function runPlan(plan, opts = {}) {
  const { destRoot, dryRun = false, forceDelete = false, logger, journal, onProgress } = opts;
  const totals = { done: 0, skipped: 0, moved: 0 };

  for (const step of plan) {
    const result = await executor.execute(step.items, step.action, step.isDir, {
      destRoot: step.action === 'move' ? moveDestination(step.key, destRoot) : null,
      dryRun,
      forceDelete,
      logger,
      onItem: ({ item, result, done, skipped }) => {
        if (journal) journal.record(item, step.action, result);
        if (onProgress) onProgress(step.label, step.action, done + skipped, step.items.length);
      },
    });

    if (step.action === 'move') totals.moved += result.done;
    totals.done += result.done;
    totals.skipped += result.skipped;

    if (logger) {
      logger.info('category_processed', {
        category: step.key,
        action: step.action,
        processed: result.done,
        skipped: result.skipped,
      });
    }
  }
  return totals;
}

module.exports = { buildPlan, defaultSelection, moveDestination, runPlan };
