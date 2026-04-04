'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');
const inquirer = require('inquirer');
const cliProgress = require('cli-progress');

// ── ANSI strip helper ──────────────────────────────────────────
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(s) { return s.replace(ANSI_RE, ''); }

// ── Design tokens ──────────────────────────────────────────────
const t = {
  brand:       chalk.cyan,
  brandBold:   chalk.bold.cyan,
  success:     chalk.green,
  successBold: chalk.bold.green,
  danger:      chalk.red,
  dangerBold:  chalk.bold.red,
  warn:        chalk.yellow,
  warnBold:    chalk.bold.yellow,
  muted:       chalk.gray,
  primary:     chalk.white,
  primaryBold: chalk.bold.white,
  dim:         chalk.dim,
};

// ── Formatters ─────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return t.muted('0 B');
  if (bytes >= 1e9) return t.danger((bytes / 1e9).toFixed(2) + ' GB');
  if (bytes >= 1e6) return t.warn((bytes / 1e6).toFixed(2) + ' MB');
  if (bytes >= 1e3) return t.primary((bytes / 1e3).toFixed(2) + ' KB');
  return bytes + ' B';
}

function fmtSizeRaw(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}

function fmtCount(n) { return n.toLocaleString(); }

function fmtPercent(part, total) {
  if (!total) return ' 0.0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

// ── Visual primitives ──────────────────────────────────────────
function makeBar(ratio, width = 16) {
  const safe = Math.max(0, Math.min(1, ratio || 0));
  const filled = Math.round(width * safe);
  return t.brand('▓'.repeat(filled)) + t.muted('░'.repeat(width - filled));
}

function actionBadge(action) {
  if (action === 'Delete') return t.dangerBold('DELETE');
  if (action === 'Move')   return t.warnBold(' MOVE ');
  return t.muted(' SKIP ');
}

// Draws a double-line box around `lines`. Border uses `color`.
// Content keeps its own chalk formatting.
function box(lines, opts = {}) {
  const { color = t.brand, width = 60, padH = 2 } = opts;
  const inner = width - 2;
  const pad = ' '.repeat(padH);
  const out = [];
  out.push('  ' + color('╔' + '═'.repeat(inner) + '╗'));
  for (const line of lines) {
    const visLen = stripAnsi(line).length;
    const space = Math.max(0, inner - padH * 2 - visLen);
    out.push('  ' + color('║') + pad + line + ' '.repeat(space) + pad + color('║'));
  }
  out.push('  ' + color('╚' + '═'.repeat(inner) + '╝'));
  return out.join('\n');
}

// Horizontal rule with a centered label
function section(title) {
  const prefix = '─── ';
  const suffix = ' ' + '─'.repeat(Math.max(4, 50 - prefix.length - title.length));
  return '\n  ' + t.brand(prefix) + t.brandBold(title) + t.brand(suffix);
}

// ── Header ─────────────────────────────────────────────────────
function printHeader(version) {
  console.log('');
  const lines = [
    t.primaryBold('reap') + t.muted('  ·  disk cleanup  ·  v' + version),
    t.muted('Your disk\'s grim reaper  ·  Windows / macOS / Linux'),
    '',
    t.muted('Space') + t.dim(':toggle  ') +
    t.muted('↑↓') + t.dim(':navigate  ') +
    t.muted('Enter') + t.dim(':confirm  ') +
    t.muted('Ctrl+C') + t.dim(':exit'),
  ];
  console.log(box(lines, { width: 62 }));
  console.log('');
}

// ── Results table ───────────────────────────────────────────────
function printResultsTable(categories) {
  const total = categories.reduce((s, c) => s + c.size, 0);

  const table = new Table({
    head: [
      t.brandBold('#'),
      t.brandBold('Category'),
      t.brandBold('Items'),
      t.brandBold('Size'),
      t.brandBold('Share'),
      t.brandBold('Action'),
    ],
    colWidths: [4, 34, 8, 12, 22, 10],
    style: { head: [], border: [] },
    chars: {
      'top':          '─', 'top-mid':      '┬',
      'top-left':     '┌', 'top-right':    '┐',
      'bottom':       '─', 'bottom-mid':   '┴',
      'bottom-left':  '└', 'bottom-right': '┘',
      'left':         '│', 'left-mid':     '├',
      'mid':          '─', 'mid-mid':      '┼',
      'right':        '│', 'right-mid':    '┤',
      'middle':       '│',
    },
  });

  categories.forEach((cat, i) => {
    const hasItems = cat.count > 0;
    const ratio = total > 0 ? cat.size / total : 0;
    const bar = hasItems
      ? makeBar(ratio, 12) + ' ' + t.primary(fmtPercent(cat.size, total).padStart(5))
      : t.muted('░'.repeat(12) + '    --');

    table.push([
      t.muted(String(i + 1)),
      hasItems ? t.primary(cat.label) : t.muted(cat.label),
      hasItems ? t.primaryBold(fmtCount(cat.count)) : t.muted('0'),
      hasItems ? fmtSize(cat.size) : t.muted('--'),
      bar,
      hasItems ? actionBadge(cat.defaultAction) : t.muted('  -- '),
    ]);
  });

  console.log(table.toString().split('\n').map(l => '  ' + l).join('\n'));
}

function printTotals(categories) {
  const total = categories.reduce((s, c) => s + c.size, 0);
  const count = categories.reduce((s, c) => s + c.count, 0);
  const avg = count ? total / count : 0;
  const densityRatio = Math.min(1, total / (200 * 1024 * 1024 * 1024));

  const lines = [
    t.muted('Recoverable  ') + t.successBold(fmtSizeRaw(total).padEnd(12)) + t.muted(fmtCount(count) + ' items'),
    t.muted('Avg size     ') + t.primary(fmtSizeRaw(avg)),
    t.muted('Density      ') + makeBar(densityRatio, 20) + t.muted('  (200 GB scale)'),
  ];
  console.log('');
  console.log(box(lines, { width: 62, color: t.muted }));
  console.log('');
}

// ── Notices ─────────────────────────────────────────────────────
function printDryRunNotice() {
  console.log('');
  const lines = [
    t.warnBold('DRY RUN MODE'),
    t.warn('No files will be changed in this run.'),
  ];
  console.log(box(lines, { width: 50, color: t.warn }));
  console.log('');
}

// ── Prompts ─────────────────────────────────────────────────────
async function promptCategorySelection(categories) {
  const nonEmpty = categories.filter(c => c.count > 0);
  if (nonEmpty.length === 0) return [];

  console.log(section('Select cleanup categories'));
  console.log('');

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Toggle categories to include:',
    choices: nonEmpty.map(cat => ({
      name:
        t.primary(cat.label.padEnd(34)) +
        t.warn(fmtSizeRaw(cat.size).padStart(10)) +
        t.muted('  ' + fmtCount(cat.count).padStart(5) + ' items  ') +
        actionBadge(cat.defaultAction),
      value: cat.key,
      checked: cat.defaultChecked !== false,
    })),
    pageSize: 10,
    validate: ans => ans.length > 0 || 'Select at least one category (or Ctrl+C to exit)',
  }]);

  return selected;
}

async function promptActionForCategory(cat, hDriveAvailable) {
  if (!hDriveAvailable || cat.defaultAction === 'Delete') return 'delete';

  const { act } = await inquirer.prompt([{
    type: 'list',
    name: 'act',
    message: t.primaryBold('"' + cat.label + '"') + t.muted('  — what to do?'),
    choices: [
      {
        name: t.warn('→  Move to destination drive') + t.muted('  (files stay accessible)'),
        value: 'move',
      },
      {
        name: t.danger('x  Delete') + t.muted('  (sent to OS Trash / Recycle Bin by default)'),
        value: 'delete',
      },
    ],
  }]);
  return act;
}

function printSelectionPreview(categories, selectedKeys, limit = 4) {
  console.log(section('Largest files in selection'));
  console.log('');

  for (const key of selectedKeys) {
    const cat = categories.find(c => c.key === key);
    if (!cat || !cat.items || cat.items.length === 0) continue;

    console.log('  ' + t.brandBold('┌ ') + t.primaryBold(cat.label));
    const top = [...cat.items]
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, limit);

    for (const [i, item] of top.entries()) {
      const connector = i === top.length - 1 ? '└' : '├';
      const sizeText = fmtSizeRaw(item.size || 0).padStart(10);
      console.log('  ' + t.brand(connector + '─ ') + t.warn(sizeText) + t.muted('  ' + item.path));
    }
    console.log('');
  }
}

async function promptShowPreview() {
  const { showPreview } = await inquirer.prompt([{
    type: 'confirm',
    name: 'showPreview',
    message: 'Show largest-file preview before execution?',
    default: true,
  }]);
  return showPreview;
}

async function promptConfirmation(plan, dryRun) {
  console.log(section('Execution plan'));
  console.log('');

  for (const item of plan) {
    const icon  = item.action === 'delete' ? t.dangerBold('x DELETE') : t.warnBold('→  MOVE ');
    const label = t.primary(item.label.padEnd(34));
    const size  = t.muted('(' + fmtSizeRaw(item.size) + ')');
    console.log('    ' + icon + '  ' + label + '  ' + size);
  }
  console.log('');

  const message = dryRun
    ? t.warnBold('Run dry-run?') + t.muted(' (nothing will be changed)')
    : t.dangerBold('Proceed with the actions above?');

  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message,
    default: dryRun ? true : false,
  }]);

  return confirmed;
}

async function promptDangerousDeleteConfirmation() {
  console.log('');
  const lines = [
    t.dangerBold('!! FORCE DELETE ENABLED'),
    t.danger('Files will be permanently deleted.'),
    t.danger('They will NOT go to Trash / Recycle Bin.'),
    '',
    t.muted('Type  DELETE  below to continue, or Ctrl+C to abort.'),
  ];
  console.log(box(lines, { width: 60, color: t.danger }));
  console.log('');

  const { token } = await inquirer.prompt([{
    type: 'input',
    name: 'token',
    message: t.dangerBold('Type DELETE to confirm:'),
  }]);

  return token === 'DELETE';
}

// ── Progress bar ────────────────────────────────────────────────
function createProgressBar() {
  return new cliProgress.SingleBar({
    format: '  ' + chalk.cyan('{bar}') + '  {percentage}%  ' + chalk.gray('{value}/{total}'),
    barCompleteChar: '▓',
    barIncompleteChar: '░',
    barsize: 28,
    hideCursor: true,
    clearOnComplete: false,
  }, cliProgress.Presets.shades_classic);
}

// ── Final report ────────────────────────────────────────────────
function printFinalReport(results, destRoot, dryRun) {
  console.log('');
  const title = dryRun ? t.warnBold('DRY RUN COMPLETE') : t.successBold('ALL DONE!');
  const lines = [
    title,
    '',
    t.muted('Processed  ') + t.successBold(fmtCount(results.done) + ' items'),
  ];
  if (results.moved > 0)
    lines.push(t.muted('Moved to   ') + t.warn(destRoot));
  if (results.skipped > 0)
    lines.push(t.muted('Skipped    ') + t.muted(fmtCount(results.skipped) + ' (locked or in use)'));
  if (dryRun) {
    lines.push('');
    lines.push(t.muted('Re-run without --dry-run to apply changes.'));
  }

  const color = dryRun ? t.warn : t.success;
  console.log(box(lines, { width: 62, color }));
  console.log('');
}

module.exports = {
  fmtSize,
  fmtSizeRaw,
  fmtCount,
  printHeader,
  printResultsTable,
  printTotals,
  printDryRunNotice,
  promptCategorySelection,
  promptActionForCategory,
  printSelectionPreview,
  promptShowPreview,
  promptConfirmation,
  promptDangerousDeleteConfirmation,
  createProgressBar,
  printFinalReport,
};
