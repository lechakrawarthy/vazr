# @lechakrawarthy/vazr

[![npm version](https://img.shields.io/npm/v/@lechakrawarthy/vazr.svg)](https://www.npmjs.com/package/@lechakrawarthy/vazr)
[![npm downloads](https://img.shields.io/npm/dm/@lechakrawarthy/vazr.svg)](https://www.npmjs.com/package/@lechakrawarthy/vazr)
[![CI](https://github.com/lechakrawarthy/vazr/actions/workflows/ci.yml/badge.svg)](https://github.com/lechakrawarthy/vazr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()
[![Code of Conduct](https://img.shields.io/badge/Code%20of%20Conduct-Contributor%20Covenant-ff69b4.svg)](CODE_OF_CONDUCT.md)

> Terminal UI for finding and eliminating disk bloat across your system.

**Quick Links:** [Features](#features) • [Quick Start](#quick-start-no-install) • [Installation](#install-globally) • [Contributing](CONTRIBUTING.md) • [Development](DEVELOPMENT.md) • [Issues](https://github.com/lechakrawarthy/vazr/issues)

## Why vazr

vazr is built for the awkward middle ground between “I need to clean this up now” and “I don't want to accidentally delete the wrong thing.” It gives you a fast scan, a visual review step, and safe defaults so you can clean up space with confidence.

## How it works

1. Scan for common disk bloat categories.
2. Review the results in an interactive terminal UI.
3. Move files to a target drive or send them to Trash/Recycle Bin.
4. Use `--dry-run` first if you want a zero-risk preview.

## TUI Preview

This is the actual terminal UI that vazr shows during review.

![vazr terminal UI preview](vazr_preview.jpeg)

## Features

- Interactive checkbox UI — pick exactly what to clean
- Scans for temp/cache, old downloads, large media, dev artifacts (node_modules, dist, build...), and other large files
- Move files to an external drive or delete them
- Safe delete mode by default (sends deletes to OS Trash/Recycle Bin)
- `--dry-run` mode to safely preview before touching anything
- JSON config file support for repeatable runs
- Audit logging to a local log file
- Works on **Windows**, **macOS**, and **Linux**
- Live spinner during scan so you always know it's working
- Dashboard-style summary with category share and largest-file preview

## Common workflows

| Goal | Command |
|---|---|
| Safe preview | `vazr --dry-run` |
| Interactive cleanup | `vazr` |
| Move files to another drive | `vazr --target "D:\Archive"` |
| Clean up with custom thresholds | `vazr --min-media 50 --old-days 14` |

## Quick Start (no install)

```bash
npx @lechakrawarthy/vazr
```

## Install globally

```bash
npm install -g @lechakrawarthy/vazr
vazr
```

## CLI Reference

```
Usage: vazr [options]

Options:
  -v, --version          Show version number
  -t, --target <path>    Destination path for moved files
                         If not provided, app prompts to choose a drive or continue delete-only
  --config <path>        Path to JSON config file
  --log-file <path>      Path to log file
  --force-delete         Permanently delete (bypass Trash/Recycle Bin)
  --dry-run              Preview changes without doing anything
  --min-media <mb>       Flag media files larger than this (default: 100)
  --min-large <mb>       Flag all files larger than this (default: 500)
  --old-days <days>      Flag downloads older than this many days (default: 60)
  -h, --help             Show help
```

## Examples

```bash
# Standard interactive run
vazr

# Safe preview — nothing will be changed
vazr --dry-run

# Use a custom destination drive
vazr --target "D:\Archive"

# Persist settings in a config file
vazr --config "C:\Users\you\.vazr\config.json"

# Force permanent deletes (extra confirmation prompt appears)
vazr --force-delete

# More aggressive — flag media >= 50 MB, downloads >= 14 days old
vazr --min-media 50 --old-days 14

# Run with npx, dry-run first
npx @lechakrawarthy/vazr --dry-run
```

## What it scans

| Category | Default Action |
|---|---|
| Temp & cache files (Windows/browser/npm) | Delete |
| Downloads not touched in 60+ days | Move to drive |
| Large media files (mp4, mkv, iso...) | Move to drive |
| Dev artifact folders (node_modules, dist, build...) | Delete |
| Other large files (catch-all) | Move to drive |

## Moved files

Files set to "Move" are placed in your target drive preserving their original folder structure so you can always find them. They open normally from the external drive with no performance difference for media, archives, or project files.

## Safety model

- By default, delete operations go to OS Trash/Recycle Bin.
- `--force-delete` enables permanent delete and requires typing `DELETE` to continue.
- When no destination is available, move-only categories automatically switch to safe alternatives.
- On startup, if destination is missing/unavailable, the app lets you pick an available drive or continue in delete-only mode.

## Config file

You can set defaults in JSON:

```json
{
  "target": "H:\\dev_hardware_moved",
  "minMediaMB": 100,
  "minLargeMB": 500,
  "oldDays": 60,
  "logFile": "C:\\Users\\you\\.vazr\\logs\\cleanup.log",
  "forceDelete": false
}
```

Default search paths for config:

- `~/.vazr/config.json`
- `~/.vazr.json`

You can override with `--config` or `VAZR_CONFIG` environment variable.

## Audit log

By default logs are written to:

- `~/.vazr/logs/cleanup.log`

Override with `--log-file`.

## Troubleshooting

- **No files found** — Try lowering `--min-media`, `--min-large`, or `--old-days`.
- **Target drive unavailable** — Choose a different destination or run delete-only mode.
- **Permission errors** — Re-run the CLI from a shell with access to the files you want to review.
- **Windows path issues** — Wrap paths in quotes, for example `--target "D:\Archive"`.

## Contributing

vazr welcomes contributions! Whether you're reporting bugs, suggesting features, or writing code:

1. **Report Issues** — Found a bug? [Open an issue](https://github.com/lechakrawarthy/vazr/issues)
2. **Suggest Features** — Have an idea? [Start a discussion or issue](https://github.com/lechakrawarthy/vazr/issues)
3. **Submit Code** — Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
4. **Improve Docs** — Docs are always welcome!

### Getting Started

- **New to contributing?** Look for issues labeled [**good first issue**](https://github.com/lechakrawarthy/vazr/issues?q=label%3A%22good%20first%20issue%22)
- **Want to understand the code?** Read [DEVELOPMENT.md](DEVELOPMENT.md) and [ARCHITECTURE.md](ARCHITECTURE.md)
- **Have questions?** Open a [GitHub Discussion](https://github.com/lechakrawarthy/vazr/discussions)

## Community

- **Code of Conduct** — See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Security Issues** — Please report via [SECURITY.md](SECURITY.md) (do not open public issues)
- **Changelog** — Check [CHANGELOG.md](CHANGELOG.md) for release notes

## License

MIT
