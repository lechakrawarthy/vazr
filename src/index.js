'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const scanner = require('./scanner');
const { runPlan } = require('./plan');
const history = require('./history');
const { createLogger } = require('./logger');
const { exportResults } = require('./exporter');
const { checkForUpdate } = require('./update-check');
const {
  Screen, ESC, tok, fmtBytes,
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
    exportFormat = null,
    exportOutput = null,
    sortBy = 'size',
    scanCategories = null, // null = all; array of keys to include
    excludePaths = [],
    updateCheck = true,
    staleDays = 30,
  } = options;

  if (!exportFormat && !(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error('vazr needs an interactive terminal. For scripts and CI, use --export json (or csv).');
  }

  // Kicked off now, awaited (with its own internal timeout) right before exit —
  // never blocks the scan/review/execute flow.
  const updateCheckPromise = checkForUpdate({ enabled: updateCheck && !exportFormat });

  const logger = createLogger(logFile);
  // Export never moves anything, so it must not stop to ask about a destination:
  // the prompt would hang in CI and end up inside `--export json > report.json`.
  const destination = exportFormat
    ? { target: null, chosenMode: 'export' }
    : await resolveDestinationTarget(target);
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
    if (cleanupDone || exportFormat) return;
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
  // In export mode stdout carries the report, so progress goes to stderr (and only
  // when someone is watching it).
  if (!exportFormat) process.stdout.write(ESC.altOn + ESC.hideCursor);

  const scanStartTime = Date.now();
  let scanText = 'Starting scan...';
  let foundCount = 0;
  let scanBytesSoFar = 0;
  let lastStderrWrite = 0;

  const onProgress = (text, bytes) => {
    scanText = text;
    if (typeof bytes === 'number') scanBytesSoFar = bytes;
    if (exportFormat) {
      if (process.stderr.isTTY && Date.now() - lastStderrWrite >= 100) {
        lastStderrWrite = Date.now();
        const line = scanText + (scanBytesSoFar > 0 ? '  ~' + fmtBytes(scanBytesSoFar) : '');
        process.stderr.write('\r\x1b[K' + line.slice(0, (process.stderr.columns || 80) - 1));
      }
      return;
    }
    screen.renderScan(version, scanText, foundCount, scanBytesSoFar);
    screen.tick();
  };

  const tempResult = await scanner.scanTempCache(onProgress);
  foundCount += tempResult.files.length;
  scanBytesSoFar = tempResult.totalSize;

  // One combined walk replaces four overlapping ones (dev artifacts, media, large
  // files, and old downloads previously each re-walked the same project trees).
  const workspaceResult = await scanner.scanWorkspace(
    {
      minMediaBytes: minMediaMB * 1024 * 1024,
      minLargeBytes: minLargeMB * 1024 * 1024,
      oldDownloadsCutoffMs: Date.now() - oldDays * 86400 * 1000,
      excludePaths,
    },
    (text, bytes) => onProgress(text, tempResult.totalSize + bytes)
  );
  const cacheResult = await scanner.scanToolCaches(onProgress);

  const dlResult = workspaceResult.oldDownloads;
  const mediaResult = workspaceResult.media;
  const devResult = workspaceResult.devArtifacts;
  const largeResult = workspaceResult.large;

  // Artifacts of projects you are still working on are shown but never pre-selected:
  // deleting node_modules in the repo you have open is the opposite of help.
  const staleCutoffMs = Date.now() - staleDays * 86400 * 1000;
  const staleDev = devResult.folders.filter(f => f.lastActivityMs < staleCutoffMs);
  const activeDev = devResult.folders.filter(f => f.lastActivityMs >= staleCutoffMs);
  const sumSize = list => list.reduce((s, f) => s + f.size, 0);

  foundCount += dlResult.files.length + mediaResult.files.length +
    devResult.folders.length + largeResult.files.length + cacheResult.folders.length;

  if (exportFormat && process.stderr.isTTY) process.stderr.write('\r\x1b[K');

  const scanDurationMs = Date.now() - scanStartTime;

  logger.info('scan_complete', {
    temp: tempResult.files.length,
    downloads: dlResult.files.length,
    media: mediaResult.files.length,
    devArtifacts: devResult.folders ? devResult.folders.length : 0,
    large: largeResult.files.length,
    toolCaches: cacheResult.folders.length,
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
      group: 'devArt',
      label: `Dev Artifacts — idle ${staleDays}d+`,
      count: staleDev.length,
      size: sumSize(staleDev),
      items: staleDev,
      isDir: true,
      defaultAction: 'Delete',
      defaultChecked: true,
    },
    {
      key: 'devArtActive',
      group: 'devArt',
      label: 'Dev Artifacts — active projects',
      count: activeDev.length,
      size: sumSize(activeDev),
      items: activeDev,
      isDir: true,
      defaultAction: 'Delete',
      defaultChecked: false,
    },
    {
      // Never pre-selected: safe to clear, but each one means a slow re-download.
      key: 'caches',
      label: 'Tool Caches (npm, pip, cargo…)',
      count: cacheResult.folders.length,
      size: cacheResult.totalSize,
      items: cacheResult.folders,
      isDir: true,
      defaultAction: 'Delete',
      defaultChecked: false,
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

  // ── Apply scanCategories filter (profile / CLI) ───────────────
  // A profile asking for 'devArt' gets both the idle and the active split.
  const visibleCategories = scanCategories
    ? categories.filter(c => scanCategories.includes(c.key) || (c.group && scanCategories.includes(c.group)))
    : categories;

  // ── Export mode (--export): skip TUI entirely ─────────────────
  if (exportFormat) {
    exportResults(visibleCategories, {
      version,
      dryRun,
      scanDurationMs,
      minMediaMB,
      minLargeMB,
      oldDays,
      staleDays,
    }, { format: exportFormat, outputPath: exportOutput || null });
    return;
  }

  // All empty?
  if (visibleCategories.every(c => c.count === 0)) {
    process.stdout.write(ESC.altOff + ESC.showCursor);
    console.log('\n  ' + chalk.green('Your drive looks clean already! Nothing to do.\n'));
    return;
  }

  // ── Category summary before TUI ───────────────────────────────
  process.stdout.write(ESC.altOff + ESC.showCursor);

  console.log('\n  ' + chalk.green.bold('Scan complete') + '  ' + chalk.dim('(' + (scanDurationMs / 1000).toFixed(1) + 's)'));
  console.log('  ' + chalk.dim('─'.repeat(54)));

  const totalSummarySize = visibleCategories.reduce((s, c) => s + c.size, 0);
  for (const cat of visibleCategories) {
    if (cat.count === 0) continue;
    const pct = totalSummarySize > 0 ? Math.round((cat.size / totalSummarySize) * 100) : 0;
    console.log(
      '  ' + chalk.cyan(cat.label.padEnd(35)) +
      chalk.yellow(fmtBytes(cat.size).padStart(10)) +
      chalk.dim('  ' + pct + '%')
    );
  }
  console.log('  ' + chalk.dim('─'.repeat(54)));
  console.log('  ' + chalk.dim('Total') + '  ' + chalk.green.bold(fmtBytes(totalSummarySize).padStart(37)));
  console.log();

  // ── REVIEW ────────────────────────────────────────────────────
  // runReview handles its own alt-screen + raw mode lifecycle

  const plan = await runReview(screen, version, visibleCategories, { ...flags, sortBy });

  if (!plan) {
    console.log('\n  ' + tok.muted('Cancelled. Nothing was changed.\n'));
    logger.info('cleanup_cancelled_by_user');
    return;
  }

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

  const journal = history.createJournal();
  const totals = await runPlan(plan, {
    destRoot,
    dryRun,
    forceDelete,
    logger,
    journal,
    onProgress: (label, action, done, total) => {
      screen.renderExecute(version, label, action, done, total);
      if (done === total) screen.flush();
      else screen.tick();
    },
  });

  // ── DONE ──────────────────────────────────────────────────────
  screen.renderDone(
    version,
    { ...totals, scanned: foundCount, scanDurationMs },
    destRoot,
    dryRun
  );
  screen.flush();

  // Wait for keypress before exiting
  enableRaw();
  await nextKey();
  disableRaw();

  process.stdout.write(ESC.altOff + ESC.showCursor);

  let runId = null;
  if (!dryRun) {
    try {
      runId = history.saveRun(journal, { version, destRoot });
    } catch (err) {
      logger.warn('history_write_failed', { reason: err.message });
    }
  }
  if (runId && totals.moved > 0) {
    console.log('\n  ' + tok.muted('Changed your mind? ') + chalk.cyan('vazr undo') + tok.muted(' moves everything back.'));
  }

  logger.info('cleanup_completed', {
    runId,
    processed: totals.done,
    skipped: totals.skipped,
    moved: totals.moved,
    dryRun,
  });

  const newerVersion = await updateCheckPromise;
  if (newerVersion) {
    console.log(
      '\n  ' + chalk.yellow('A newer version of vazr is available: ') +
      chalk.dim(version) + chalk.yellow(' → ') + chalk.green.bold(newerVersion) +
      chalk.dim('\n  Run ') + chalk.cyan('npm install -g @lechakrawarthy/vazr@latest') + chalk.dim(' to update.\n')
    );
  }
}

module.exports = { run };
