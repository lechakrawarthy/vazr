'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');
const inquirer = require('inquirer');
const cliProgress = require('cli-progress');

// ── Formatters ───────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return chalk.gray('0 B');
  if (bytes >= 1e9) return chalk.red((bytes / 1e9).toFixed(2) + ' GB');
  if (bytes >= 1e6) return chalk.yellow((bytes / 1e6).toFixed(2) + ' MB');
  if (bytes >= 1e3) return chalk.white((bytes / 1e3).toFixed(2) + ' KB');
  return bytes + ' B';
}

function fmtSizeRaw(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}

function fmtCount(n) {
  return n.toLocaleString();
}

function fmtPercent(part, total) {
  if (!total) return '0.0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

function makeBar(ratio, width = 24) {
  const safe = Math.max(0, Math.min(1, ratio || 0));
  const filled = Math.round(width * safe);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

function actionBadge(action) {
  if (action === 'Delete') return chalk.red('DELETE');
  if (action === 'Move') return chalk.yellow('MOVE');
  return chalk.gray('SKIP');
}

// ── Header ───────────────────────────────────────────────────
function printHeader(version) {
  console.log('');
  console.log(chalk.cyan('  =========================================================='));
  console.log(chalk.cyan('   disk-cleanup-tui  v' + version + '  |  interactive storage recovery'));
  console.log(chalk.cyan('  =========================================================='));
  console.log('');
  console.log(chalk.gray('  Controls: Space toggle | Arrows navigate | Enter confirm | Ctrl+C exit'));
  console.log('');
}

// ── Results table ────────────────────────────────────────────
function printResultsTable(categories) {
  const total = categories.reduce((s, c) => s + c.size, 0);

  const table = new Table({
    head: [
      chalk.bold.white('#'),
      chalk.bold.white('Category'),
      chalk.bold.white('Items'),
      chalk.bold.white('Size'),
      chalk.bold.white('Share'),
      chalk.bold.white('Default Action'),
    ],
    colWidths: [4, 34, 10, 12, 9, 18],
    style: { head: [], border: ['gray'] },
  });

  categories.forEach((cat, i) => {
    const hasItems = cat.count > 0;
    table.push([
      chalk.gray(String(i + 1)),
      hasItems ? chalk.white(cat.label) : chalk.gray(cat.label),
      hasItems ? chalk.white(fmtCount(cat.count)) : chalk.gray('0'),
      hasItems ? fmtSize(cat.size) : chalk.gray('--'),
      hasItems ? chalk.white(fmtPercent(cat.size, total)) : chalk.gray('--'),
      hasItems ? actionBadge(cat.defaultAction)
        : chalk.gray('--'),
    ]);
  });

  console.log(table.toString());
}

function printTotals(categories) {
  const total = categories.reduce((s, c) => s + c.size, 0);
  const count = categories.reduce((s, c) => s + c.count, 0);
  const avg = count ? total / count : 0;

  console.log('');
  console.log(
    chalk.cyan('  Recoverable: ') +
    chalk.bold.green(fmtSizeRaw(total)) +
    chalk.gray(' across ' + fmtCount(count) + ' items')
  );
  console.log(chalk.gray('  Average item size: ' + fmtSizeRaw(avg)));
  console.log(chalk.cyan('  Density: ') + chalk.white(makeBar(Math.min(1, total / (200 * 1024 * 1024 * 1024)))) + chalk.gray(' (target 200 GB scale)'));
  console.log('');
}

// ── Dry-run summary ──────────────────────────────────────────
function printDryRunNotice() {
  console.log('');
  console.log(chalk.bgYellow.black('  DRY RUN MODE -- no files will be changed  '));
  console.log('');
}

// ── Prompts ──────────────────────────────────────────────────
async function promptCategorySelection(categories) {
  const nonEmpty = categories.filter(c => c.count > 0);
  if (nonEmpty.length === 0) return [];

  console.log(chalk.bold('  Select cleanup buckets'));

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Choose categories to include in this run:',
    choices: nonEmpty.map(cat => ({
      name:
        `${cat.label.padEnd(32)} ` +
        `${chalk.white(fmtSizeRaw(cat.size).padStart(10))} ` +
        `${chalk.gray(String(cat.count).padStart(6) + ' items')} ` +
        `${actionBadge(cat.defaultAction)}`,
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
    message: `"${cat.label}" -- what to do?`,
    choices: [
      {
        name: chalk.yellow('Move to destination drive') + chalk.gray('  (safe, files stay accessible)'),
        value: 'move',
      },
      {
        name: chalk.red('Delete (sent to OS Trash/Recycle Bin by default)'),
        value: 'delete',
      },
    ],
  }]);
  return act;
}

function printSelectionPreview(categories, selectedKeys, limit = 4) {
  console.log('');
  console.log(chalk.bold('  Preview of largest selected entries'));

  for (const key of selectedKeys) {
    const cat = categories.find(c => c.key === key);
    if (!cat || !cat.items || cat.items.length === 0) continue;

    console.log(chalk.cyan('   - ' + cat.label));
    const top = [...cat.items]
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, limit);

    for (const item of top) {
      const sizeText = fmtSizeRaw(item.size || 0).padStart(10);
      console.log(chalk.gray('      ' + sizeText + '  ' + item.path));
    }
  }
  console.log('');
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
  console.log('');
  console.log(chalk.bold('  Plan:'));
  for (const item of plan) {
    const icon = item.action === 'delete'
      ? chalk.red('DELETE')
      : chalk.yellow('MOVE  ');
    console.log(`    ${icon}  ${item.label}  ${chalk.gray('(' + fmtSizeRaw(item.size) + ')')}`);
  }
  console.log('');

  const message = dryRun
    ? chalk.yellow('Run dry-run? (nothing will be deleted)')
    : chalk.bold.red('Proceed with selected actions?');

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
  console.log(chalk.bgRed.white('  DANGER: FORCE DELETE ENABLED  '));
  console.log(chalk.red('  Files will be permanently deleted and bypass OS trash/recycle bin.'));

  const { token } = await inquirer.prompt([{
    type: 'input',
    name: 'token',
    message: 'Type DELETE to continue:',
  }]);

  return token === 'DELETE';
}

// ── Progress bar ─────────────────────────────────────────────
function createProgressBar() {
  return new cliProgress.SingleBar({
    format: '  ' + chalk.cyan('{bar}') + ' {percentage}%  {value}/{total}  {filename}',
    barCompleteChar: '#',
    barIncompleteChar: '-',
    hideCursor: true,
    clearOnComplete: false,
  }, cliProgress.Presets.shades_classic);
}

// ── Final report ─────────────────────────────────────────────
function printFinalReport(results, destRoot, dryRun) {
  console.log('');
  console.log(chalk.cyan('  +-----------------------------------------+'));
  console.log(chalk.cyan('  |  ' + (dryRun ? 'DRY RUN COMPLETE' : 'DONE!').padEnd(41) + '|'));
  console.log(chalk.cyan('  +-----------------------------------------+'));
  console.log(chalk.green('  Processed : ' + fmtCount(results.done) + ' items'));
  if (results.moved > 0)
    console.log(chalk.yellow('  Moved to  : ' + destRoot));
  if (results.skipped > 0)
    console.log(chalk.gray('  Skipped   : ' + fmtCount(results.skipped) + ' (locked or in use)'));
  if (dryRun)
    console.log(chalk.yellow('\n  Re-run without --dry-run to apply changes.'));
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
