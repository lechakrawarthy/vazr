#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const pkg = require('../package.json');
const chalk = require('chalk');
const { loadConfig, buildRuntimeOptions } = require('../src/config');
const {
  parsePositiveInteger,
  normalizePath,
  assertTargetPathSafe,
} = require('../src/validators');

const program = new Command();

program
  .name('disk-cleanup')
  .description('Interactive terminal UI to scan and clean junk files from your system')
  .version(pkg.version, '-v, --version')

  .option(
    '-t, --target <path>',
    'Destination path for moved files (e.g. H:\\dev_hardware_moved)'
  )
  .option('--config <path>', 'Path to JSON config file')
  .option('--log-file <path>', 'Path to audit log output file')
  .option(
    '--dry-run',
    'Preview what would be deleted/moved without actually doing it'
  )
  .option(
    '--force-delete',
    'Permanently delete selected files instead of moving deletes to OS trash/recycle bin'
  )
  .option(
    '--min-media <mb>',
    'Minimum file size in MB to flag as large media'
  )
  .option(
    '--min-large <mb>',
    'Minimum file size in MB for the catch-all large files scan'
  )
  .option(
    '--old-days <days>',
    'Number of days since last access to flag a download as old'
  )

  .addHelpText('after', `
Examples:
  $ disk-cleanup
  $ disk-cleanup --dry-run
  $ disk-cleanup --target D:\\Archive
  $ disk-cleanup --min-media 50 --old-days 30
  $ npx disk-cleanup-tui --dry-run
  `)
  .parse(process.argv);

const opts = program.opts();

let runtimeOptions;
try {
  const loadedConfig = loadConfig(opts.config);
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

  if (runtimeOptions.target) {
    assertTargetPathSafe(runtimeOptions.target);
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
