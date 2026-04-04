'use strict';

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const chalk = require('chalk');
const scanner = require('./scanner');
const executor = require('./executor');
const ui = require('./ui');
const { createLogger } = require('./logger');

function isDestinationAvailable(destRoot) {
  if (!destRoot) return false;
  const normalized = path.resolve(destRoot);
  const root = path.parse(normalized).root;
  return Boolean(root) && fs.existsSync(root);
}

async function run(options = {}) {
  const {
    dryRun = false,
    target = null,
    minMediaMB = 100,
    minLargeMB = 500,
    oldDays = 60,
    forceDelete = false,
    logFile = null,
    configPath = null,
    version = '1.0.0',
  } = options;

  const logger = createLogger(logFile);

  // Resolve destination drive
  const destRoot = target;
  const destAvailable = isDestinationAvailable(destRoot);

  logger.info('cleanup_started', {
    dryRun,
    target: destRoot,
    minMediaMB,
    minLargeMB,
    oldDays,
    forceDelete,
    configPath,
  });

  ui.printHeader(version);

  if (dryRun) ui.printDryRunNotice();

  if (!destAvailable) {
    console.log(chalk.yellow('  Warning: Destination drive not found: ' + (destRoot || '(none set)')));
    console.log(chalk.yellow('  Files will be set to Delete only. Use --target to set a destination.\n'));
    logger.warn('destination_unavailable', { target: destRoot });
  } else {
    logger.info('destination_ready', { target: destRoot });
  }

  // ── Scan phase ──────────────────────────────────────────────
  const spinner = ora({ text: 'Starting scan...', color: 'cyan' }).start();

  const tempResult = scanner.scanTempCache(t => { spinner.text = t; });
  const dlResult = scanner.scanOldDownloads(oldDays, t => { spinner.text = t; });
  const mediaResult = scanner.scanLargeMedia(minMediaMB * 1024 * 1024, t => { spinner.text = t; });
  const devResult = scanner.scanDevArtifacts(t => { spinner.text = t; });
  const alreadyFound = mediaResult.files.map(f => f.path);
  const largeResult = scanner.scanLargeFiles(minLargeMB * 1024 * 1024, alreadyFound, t => { spinner.text = t; });

  spinner.succeed(chalk.green('Scan complete!'));
  console.log('');
  logger.info('scan_complete', {
    tempFiles: tempResult.files.length,
    downloadsFiles: dlResult.files.length,
    mediaFiles: mediaResult.files.length,
    devArtifacts: devResult.folders ? devResult.folders.length : 0,
    largeFiles: largeResult.files.length,
  });

  // ── Build categories ────────────────────────────────────────
  const categories = [
    {
      key: 'temp',
      label: 'Temp & Cache Files',
      count: tempResult.files.length,
      size: tempResult.totalSize,
      items: tempResult.files,
      isDir: false,
      defaultAction: 'Delete',
      defaultChecked: true,
    },
    {
      key: 'downloads',
      label: `Old Downloads (${oldDays}d+)`,
      count: dlResult.files.length,
      size: dlResult.totalSize,
      items: dlResult.files,
      isDir: false,
      defaultAction: destAvailable ? 'Move' : 'Delete',
      defaultChecked: true,
    },
    {
      key: 'media',
      label: `Large Media (>= ${minMediaMB} MB)`,
      count: mediaResult.files.length,
      size: mediaResult.totalSize,
      items: mediaResult.files,
      isDir: false,
      defaultAction: destAvailable ? 'Move' : 'Skip',
      defaultChecked: false,
    },
    {
      key: 'devArt',
      label: 'Dev Artifacts (node_modules etc.)',
      count: devResult.folders ? devResult.folders.length : 0,
      size: devResult.totalSize,
      items: devResult.folders || [],
      isDir: true,
      defaultAction: 'Delete',
      defaultChecked: true,
    },
    {
      key: 'catchAll',
      label: `Other Large Files (> ${minLargeMB} MB)`,
      count: largeResult.files.length,
      size: largeResult.totalSize,
      items: largeResult.files,
      isDir: false,
      defaultAction: destAvailable ? 'Move' : 'Skip',
      defaultChecked: false,
    },
  ];

  ui.printResultsTable(categories);
  ui.printTotals(categories);

  if (categories.every(c => c.count === 0)) {
    console.log(chalk.green('  Your drive looks clean already!'));
    return;
  }

  // ── Selection phase ─────────────────────────────────────────
  const selectedKeys = await ui.promptCategorySelection(categories);
  if (selectedKeys.length === 0) {
    console.log(chalk.gray('\n  Nothing selected. Exiting.\n'));
    return;
  }

  const showPreview = await ui.promptShowPreview();
  if (showPreview) {
    ui.printSelectionPreview(categories, selectedKeys);
  }

  // Ask delete vs move for each selected category
  const actionMap = {};
  for (const key of selectedKeys) {
    const cat = categories.find(c => c.key === key);
    if (cat.defaultAction === 'Skip') {
      console.log(chalk.gray(`  Skipping "${cat.label}" (no destination drive available).`));
      continue;
    }
    actionMap[key] = await ui.promptActionForCategory(cat, destAvailable);
  }

  // Build execution plan
  const plan = selectedKeys
    .filter(k => actionMap[k])
    .map(k => {
      const cat = categories.find(c => c.key === k);
      return { key: k, label: cat.label, size: cat.size, action: actionMap[k] };
    });

  if (plan.length === 0) {
    console.log(chalk.gray('\n  Nothing to do. Exiting.\n'));
    return;
  }

  const confirmed = await ui.promptConfirmation(plan, dryRun);
  if (!confirmed) {
    console.log(chalk.gray('\n  Cancelled. Nothing was changed.\n'));
    logger.info('cleanup_cancelled_by_user');
    return;
  }

  const hasDeleteActions = plan.some(item => item.action === 'delete');
  if (!dryRun && hasDeleteActions && forceDelete) {
    const dangerousConfirmed = await ui.promptDangerousDeleteConfirmation();
    if (!dangerousConfirmed) {
      console.log(chalk.gray('\n  Cancelled. Nothing was changed.\n'));
      logger.info('cleanup_cancelled_force_delete_guard');
      return;
    }
  }

  // ── Execution phase ─────────────────────────────────────────
  console.log('');
  const bar = ui.createProgressBar();
  let totalDone = 0; let totalSkipped = 0; let totalMoved = 0;

  for (const planItem of plan) {
    const cat = categories.find(c => c.key === planItem.key);
    const action = planItem.action;
    const items = cat.items;

    if (items.length === 0) continue;

    console.log(chalk.cyan(`\n  Processing: ${cat.label}`));
    bar.start(items.length, 0, { filename: '' });
    let done = 0; let skipped = 0;

    const catDestRoot = action === 'move'
      ? (planItem.key === 'downloads' ? path.join(destRoot, 'Downloads')
        : planItem.key === 'media' ? path.join(destRoot, 'Media')
          : path.join(destRoot, 'LargeFiles'))
      : null;

    const result = await executor.execute(items, action, cat.isDir, {
      destRoot: catDestRoot,
      dryRun,
      forceDelete,
      logger,
      onItem: ({ result, done: d, skipped: s }) => {
        done = d;
        skipped = s;
        bar.update(d + s, { filename: '' });
      },
    });

    bar.update(items.length, { filename: 'done' });
    bar.stop();

    if (action === 'move') totalMoved += done;
    totalDone += done;
    totalSkipped += skipped;
    logger.info('category_processed', {
      category: cat.key,
      action,
      processed: result.done,
      skipped: result.skipped,
    });
    console.log(chalk.green(`  OK: ${done} processed`) + chalk.gray(` (${skipped} skipped)`));
  }

  ui.printFinalReport(
    { done: totalDone, skipped: totalSkipped, moved: totalMoved },
    destRoot,
    dryRun
  );

  logger.info('cleanup_completed', {
    processed: totalDone,
    skipped: totalSkipped,
    moved: totalMoved,
    dryRun,
    logFile: logger.logFilePath,
  });
}

module.exports = { run };
