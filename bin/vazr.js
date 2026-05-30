#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const pkg = require('../package.json');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig, buildRuntimeOptions } = require('../src/config');
const {
  parsePositiveInteger,
  normalizePath,
  assertTargetPathSafe,
} = require('../src/validators');
const profiles = require('../src/profiles');

const program = new Command();

// ── Enhanced --version ────────────────────────────────────────────
program
  .name('vazr')
  .description('Terminal UI for finding and eliminating disk bloat')
  .version(
    `vazr/${pkg.version}  node/${process.version}  ${process.platform}/${process.arch}`,
    '-v, --version',
    'Output vazr version, Node version, and platform'
  );

// ── Main scan options ─────────────────────────────────────────────
program
  .option('-t, --target <path>', 'Destination path for moved files (e.g. H:\\dev_hardware_moved)')
  .option('--config <path>', 'Path to JSON config file')
  .option('--log-file <path>', 'Path to audit log output file')
  .option('--dry-run', 'Preview what would be deleted/moved without actually doing it')
  .option('--force-delete', 'Permanently delete selected files instead of moving deletes to OS trash/recycle bin')
  .option('--min-media <mb>', 'Minimum file size in MB to flag as large media')
  .option('--min-large <mb>', 'Minimum file size in MB for the catch-all large files scan')
  .option('--old-days <days>', 'Number of days since last access to flag a download as old')
  .option('--sort <mode>', 'Sort categories by: size (default), name, count', 'size')
  .option('--profile <name>', 'Load a named profile from ~/.vazr/profiles/ or built-ins')
  .option(
    '--export [format]',
    'Export scan results as json or csv without launching the TUI (default: json)',
    false
  )
  .option('--export-output <path>', 'Write export output to file instead of stdout')
  .addHelpText('after', `
Examples:
  $ vazr
  $ vazr --dry-run
  $ vazr --target D:\\Archive
  $ vazr --min-media 50 --old-days 30
  $ vazr --sort name
  $ vazr --profile minimal
  $ vazr --export json > bloat-report.json
  $ vazr --export csv --export-output report.csv
  $ npx vazr --dry-run
  `);

// ── profile subcommand ────────────────────────────────────────────
const profileCmd = program.command('profile').description('Manage cleanup profiles');

profileCmd
  .command('list')
  .description('List all available profiles (built-in and user-defined)')
  .action(() => {
    const list = profiles.listProfiles();
    console.log('\n  ' + chalk.green.bold('Available profiles') + '\n');
    for (const p of list) {
      const srcTag = p.source === 'builtin'
        ? chalk.dim('[builtin]')
        : chalk.cyan('[user]   ');
      console.log('  ' + chalk.yellow(p.name.padEnd(16)) + ' ' + srcTag + '  ' + chalk.dim(p.description));
    }
    console.log();
  });

profileCmd
  .command('create <name>')
  .description('Create a new profile interactively from current scan settings')
  .option('--dry-run', 'Mark profile as dry-run by default')
  .option('--force-delete', 'Mark profile as force-delete by default')
  .option('--min-media <mb>', 'Minimum media size in MB')
  .option('--min-large <mb>', 'Minimum large file size in MB')
  .option('--old-days <days>', 'Days threshold for old downloads')
  .option('--description <text>', 'Short description for this profile', '')
  .option('--categories <list>', 'Comma-separated scan category keys (temp,downloads,media,devArt,catchAll)', 'temp,downloads,media,devArt,catchAll')
  .action((name, opts) => {
    const catKeys = opts.categories.split(',').map(s => s.trim()).filter(Boolean);
    const profileData = {
      description: opts.description || `Custom profile "${name}"`,
      scanCategories: catKeys,
      dryRun: !!opts.dryRun,
      forceDelete: !!opts.forceDelete,
    };
    if (opts.minMedia) profileData.minMediaMB = parseInt(opts.minMedia, 10);
    if (opts.minLarge) profileData.minLargeMB = parseInt(opts.minLarge, 10);
    if (opts.oldDays) profileData.oldDays = parseInt(opts.oldDays, 10);

    const filePath = profiles.saveProfile(name, profileData);
    console.log('\n  ' + chalk.green('✓ Profile saved: ') + chalk.yellow(name));
    console.log('  ' + chalk.dim(filePath) + '\n');
  });

profileCmd
  .command('export <name>')
  .description('Print a profile as JSON (pipe to a file to share it)')
  .action((name) => {
    try {
      const json = profiles.exportProfile(name);
      process.stdout.write(json + '\n');
    } catch (err) {
      console.error(chalk.red('\n  ' + err.message + '\n'));
      process.exit(1);
    }
  });

profileCmd
  .command('import <file>')
  .description('Import a profile from a JSON file (use "-" to read from stdin)')
  .action(async (file) => {
    try {
      let json;
      if (file === '-') {
        json = fs.readFileSync('/dev/stdin', 'utf8');
      } else {
        json = fs.readFileSync(file, 'utf8');
      }
      const name = profiles.importProfile(json);
      console.log('\n  ' + chalk.green('✓ Profile imported: ') + chalk.yellow(name) + '\n');
    } catch (err) {
      console.error(chalk.red('\n  ' + err.message + '\n'));
      process.exit(1);
    }
  });

profileCmd
  .command('delete <name>')
  .description('Delete a user-defined profile (cannot delete built-ins)')
  .action((name) => {
    try {
      profiles.deleteProfile(name);
      console.log('\n  ' + chalk.green('✓ Profile deleted: ') + chalk.yellow(name) + '\n');
    } catch (err) {
      console.error(chalk.red('\n  ' + err.message + '\n'));
      process.exit(1);
    }
  });

program.parse(process.argv);

// ── Only run if no subcommand was matched ─────────────────────────
// Commander runs subcommand actions directly; if we reach here, run main scan.
if (!process.argv.slice(2).some(a => a === 'profile')) {
  const opts = program.opts();

  let runtimeOptions;
  try {
    // ── Project-local config (.vazr.json in cwd or any parent) ───
    let localConfigPath = null;
    let searchDir = process.cwd();
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(searchDir, '.vazr.json');
      if (fs.existsSync(candidate)) { localConfigPath = candidate; break; }
      const parent = path.dirname(searchDir);
      if (parent === searchDir) break;
      searchDir = parent;
    }

    const configFilePath = opts.config || localConfigPath;
    const loadedConfig = loadConfig(configFilePath);

    if (localConfigPath && !opts.config) {
      console.log(chalk.dim('\n  Using project config: ' + localConfigPath));
    }

    const cliOptions = {
      dryRun: opts.dryRun,
      target: opts.target ? normalizePath(opts.target) : undefined,
      minMediaMB: parsePositiveInteger(opts.minMedia, '--min-media'),
      minLargeMB: parsePositiveInteger(opts.minLarge, '--min-large'),
      oldDays: parsePositiveInteger(opts.oldDays, '--old-days'),
      forceDelete: opts.forceDelete,
      logFile: opts.logFile ? normalizePath(opts.logFile) : undefined,
    };

    runtimeOptions = buildRuntimeOptions(cliOptions, loadedConfig.config);
    runtimeOptions.version = pkg.version;
    runtimeOptions.configPath = loadedConfig.configPath;
    runtimeOptions.sortBy = opts.sort || 'size';

    // ── Apply profile (lower priority than explicit CLI flags) ────
    if (opts.profile) {
      const profile = profiles.loadProfile(opts.profile);
      // Profile fills in blanks not set by CLI
      if (profile.dryRun && !opts.dryRun) runtimeOptions.dryRun = profile.dryRun;
      if (profile.forceDelete && !opts.forceDelete) runtimeOptions.forceDelete = profile.forceDelete;
      if (profile.minMediaMB && !opts.minMedia) runtimeOptions.minMediaMB = profile.minMediaMB;
      if (profile.minLargeMB && !opts.minLarge) runtimeOptions.minLargeMB = profile.minLargeMB;
      if (profile.oldDays && !opts.oldDays) runtimeOptions.oldDays = profile.oldDays;
      if (profile.scanCategories) runtimeOptions.scanCategories = profile.scanCategories;
    }

    // ── Export flag ───────────────────────────────────────────────
    if (opts.export !== false) {
      const fmt = typeof opts.export === 'string' ? opts.export : 'json';
      runtimeOptions.exportFormat = fmt;
      runtimeOptions.exportOutput = opts.exportOutput ? normalizePath(opts.exportOutput) : null;
    }

    if (runtimeOptions.target) {
      try {
        assertTargetPathSafe(runtimeOptions.target);
      } catch (targetErr) {
        const msg = String(targetErr && targetErr.message ? targetErr.message : targetErr);
        if (msg.includes('Target drive or root path does not exist')) {
          console.error(chalk.yellow('\n  Warning: Configured target is currently unavailable: ' + runtimeOptions.target));
          console.error(chalk.yellow('  The app will let you choose another drive or continue in delete-only mode.\n'));
          runtimeOptions.target = null;
        } else {
          throw targetErr;
        }
      }
    }
  } catch (err) {
    console.error(chalk.red('\n  Invalid configuration: ' + err.message));
    process.exit(1);
  }

  require('../src/index').run(runtimeOptions).catch(err => {
    console.error(chalk.red('\n  Fatal error: ' + err.message));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
