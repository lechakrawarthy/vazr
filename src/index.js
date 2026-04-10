'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const scanner = require('./scanner');
const executor = require('./executor');
const { createLogger } = require('./logger');
const {
  Screen, ESC, tok,
  enableRaw, disableRaw, nextKey,
  runReview, confirmForceDelete,
} = require('./tui');

function isDestinationAvailable(destRoot) {
  if (!destRoot) return false;
  const normalized = path.resolve(destRoot);
  const root = path.parse(normalized).root;
  return Boolean(root) && fs.existsSync(root);
}

function listAvailableWindowsDrives() {
  const drives = [];
  const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    const root = letter + ':\\';
    try {
      if (fs.existsSync(root)) drives.push(root);
    } catch {
      // ignore inaccessible roots
    }
  }
  return drives;
}

async function resolveDestinationTarget(initialTarget) {
  if (isDestinationAvailable(initialTarget)) {
    return { target: initialTarget, chosenMode: 'target' };
  }

  const warning = initialTarget
    ? `Destination not available right now: ${initialTarget}`
    : 'No destination drive configured.';
  console.log(chalk.yellow('\n  ' + warning));

  const canChooseDrive = process.platform === 'win32' && listAvailableWindowsDrives().length > 0;
  const choices = [
    {
      name: chalk.red('Continue in delete-only mode (no move destination)'),
      value: 'delete-only',
    },
  ];

  if (canChooseDrive) {
    choices.unshift({
      name: chalk.cyan('Choose a destination drive now'),
      value: 'choose-drive',
    });
  }

  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
    message: 'How do you want to continue?',
    choices,
  }]);

  if (mode !== 'choose-drive') {
    return { target: null, chosenMode: 'delete-only' };
  }

  const drives = listAvailableWindowsDrives();
  const { driveRoot } = await inquirer.prompt([{
    type: 'list',
    name: 'driveRoot',
    message: 'Select destination drive:',
    choices: drives.map(root => ({
      name: root + '  (will use ' + path.join(root, 'vazr_archive') + ')',
      value: root,
    })),
  }]);

  return {
    target: path.join(driveRoot, 'vazr_archive'),
    chosenMode: 'target',
  };
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
  const destination = await resolveDestinationTarget(target);
  const destRoot = destination.target;
  const destAvailable = isDestinationAvailable(destRoot);
  const flags = { dryRun, forceDelete, destAvailable };

  logger.info('cleanup_started', {
    dryRun,
    target: destRoot,
    destinationMode: destination.chosenMode,
    minMediaMB,
    minLargeMB,
    oldDays,
    forceDelete,
    configPath,
  });

  const screen = new Screen();

  // Graceful cleanup on forced exit — restores terminal state regardless of which
  // phase is active (scan, review, execute). Safe to call multiple times.
  let cleanupDone = false;
  const exitCleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    try { disableRaw(); } catch { /* ignore if not in raw mode */ }
    process.stdout.write(ESC.altOff + ESC.showCursor + '\n');
  };
  process.on('exit', exitCleanup);
  process.on('SIGINT', () => {
    exitCleanup();
    logger.info('cleanup_cancelled_sigint');
    process.exit(0);
  });

  // ── SCAN ──────────────────────────────────────────────────────
  process.stdout.write(ESC.altOn + ESC.hideCursor);

  const scanStartTime = Date.now();
  let scanText = 'Starting scan...';
  let foundCount = 0;

  const onProgress = (text) => {
    scanText = text;
    screen.renderScan(version, scanText, foundCount);
    screen.tick();
  };

  const tempResult = await scanner.scanTempCache(onProgress);
  foundCount += tempResult.files.length;

  const dlResult = await scanner.scanOldDownloads(oldDays, onProgress);
  foundCount += dlResult.files.length;

  const mediaResult = await scanner.scanLargeMedia(minMediaMB * 1024 * 1024, onProgress);
  foundCount += mediaResult.files.length;

  const devResult = await scanner.scanDevArtifacts(onProgress);
  foundCount += devResult.folders ? devResult.folders.length : 0;

  const alreadyFound = mediaResult.files.map(f => f.path);
  const largeResult = await scanner.scanLargeFiles(minLargeMB * 1024 * 1024, alreadyFound, onProgress);
  foundCount += largeResult.files.length;

  const scanDurationMs = Date.now() - scanStartTime;

  logger.info('scan_complete', {
    temp: tempResult.files.length,
    downloads: dlResult.files.length,
    media: mediaResult.files.length,
    devArtifacts: devResult.folders ? devResult.folders.length : 0,
    large: largeResult.files.length,
  });

  // ── Build categories ───────────────────────────────────────────
  const categories = [
    {
      key: 'temp',
      label: 'Temp & Cache',
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
      label: `Large Media (≥ ${minMediaMB} MB)`,
      count: mediaResult.files.length,
      size: mediaResult.totalSize,
      items: mediaResult.files,
      isDir: false,
      defaultAction: destAvailable ? 'Move' : 'Skip',
      defaultChecked: false,
    },
    {
      key: 'devArt',
      label: 'Dev Artifacts (node_modules…)',
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

  if (!destAvailable && destRoot) {
    logger.warn('destination_unavailable', { target: destRoot });
  }

  // All empty?
  if (categories.every(c => c.count === 0)) {
    process.stdout.write(ESC.altOff + ESC.showCursor);
    console.log('\n  ' + chalk.green('Your drive looks clean already! Nothing to do.\n'));
    return;
  }

  // ── REVIEW ────────────────────────────────────────────────────
  // runReview handles its own alt-screen + raw mode lifecycle
  process.stdout.write(ESC.altOff + ESC.showCursor);

  const reviewResult = await runReview(screen, version, categories, flags);

  if (!reviewResult) {
    console.log('\n  ' + tok.muted('Cancelled. Nothing was changed.\n'));
    logger.info('cleanup_cancelled_by_user');
    return;
  }

  const { selectedKeys, actionMap } = reviewResult;
  const plan = selectedKeys
    .filter(k => actionMap[k])
    .map(k => {
      const cat = categories.find(c => c.key === k);
      return { key: k, label: cat.label, size: cat.size, action: actionMap[k] };
    });

  if (plan.length === 0) {
    console.log('\n  ' + tok.muted('Nothing to do. Exiting.\n'));
    return;
  }

  // Force delete gate
  const hasDeletes = plan.some(i => i.action === 'delete');
  if (!dryRun && hasDeletes && forceDelete) {
    const ok = await confirmForceDelete(screen, version);
    if (!ok) {
      console.log('\n  ' + tok.muted('Cancelled. Nothing was changed.\n'));
      logger.info('cleanup_cancelled_force_delete_guard');
      return;
    }
  }

  // ── EXECUTE ───────────────────────────────────────────────────
  process.stdout.write(ESC.altOn + ESC.hideCursor);

  let totalDone = 0, totalSkipped = 0, totalMoved = 0;

  for (const planItem of plan) {
    const cat = categories.find(c => c.key === planItem.key);
    const action = planItem.action;
    const items = cat.items;
    if (items.length === 0) continue;

    const catDest = action === 'move'
      ? (planItem.key === 'downloads' ? path.join(destRoot, 'Downloads')
        : planItem.key === 'media' ? path.join(destRoot, 'Media')
          : path.join(destRoot, 'LargeFiles'))
      : null;

    const result = await executor.execute(items, action, cat.isDir, {
      destRoot: catDest,
      dryRun,
      forceDelete,
      logger,
      onItem: ({ done, skipped }) => {
        screen.renderExecute(version, cat.label, action, done + skipped, items.length);
        screen.tick();
      },
    });

    // Final progress flush for this category
    screen.renderExecute(version, cat.label, action, items.length, items.length);
    screen.flush();

    if (action === 'move') totalMoved += result.done;
    totalDone += result.done;
    totalSkipped += result.skipped;

    logger.info('category_processed', {
      category: cat.key,
      action,
      processed: result.done,
      skipped: result.skipped,
    });
  }

  // ── DONE ──────────────────────────────────────────────────────
  screen.renderDone(
    version,
    { done: totalDone, skipped: totalSkipped, moved: totalMoved, scanned: foundCount, scanDurationMs },
    destRoot,
    dryRun
  );
  screen.flush();

  // Wait for keypress before exiting
  enableRaw();
  await nextKey();
  disableRaw();

  process.stdout.write(ESC.altOff + ESC.showCursor);

  logger.info('cleanup_completed', {
    processed: totalDone,
    skipped: totalSkipped,
    moved: totalMoved,
    dryRun,
  });
}

module.exports = { run };
