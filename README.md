# disk-cleanup-tui

> Interactive terminal UI to scan, review, and clean junk files from your system — like `npkill` but for everything.

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
- Dashboard-style summary table with category share and largest-file preview

## Quick Start (no install)

```bash
npx disk-cleanup-tui
```

## Install globally

```bash
npm install -g disk-cleanup-tui
disk-cleanup
```

## Local development

```bash
npm install
npm run dev
```

## Usage

```
Usage: disk-cleanup [options]

Options:
  -v, --version          Show version number
  -t, --target <path>    Destination path for moved files
                         Default (Windows): H:\dev_hardware_moved
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
disk-cleanup

# Safe preview — nothing will be changed
disk-cleanup --dry-run

# Use a custom destination drive
disk-cleanup --target "D:\Archive"

# Persist settings in a config file
disk-cleanup --config "C:\Users\you\.disk-cleanup-tui\config.json"

# Force permanent deletes (extra confirmation prompt appears)
disk-cleanup --force-delete

# More aggressive — flag media >= 50 MB, downloads >= 14 days old
disk-cleanup --min-media 50 --old-days 14

# Run with npx, dry-run first
npx disk-cleanup-tui --dry-run
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

## Config file

You can set defaults in JSON:

```json
{
  "target": "H:\\dev_hardware_moved",
  "minMediaMB": 100,
  "minLargeMB": 500,
  "oldDays": 60,
  "logFile": "C:\\Users\\you\\.disk-cleanup-tui\\logs\\cleanup.log",
  "forceDelete": false
}
```

Default search paths for config:

- `~/.disk-cleanup-tui/config.json`
- `~/.disk-cleanup-tui.json`

You can override with `--config` or `DISK_CLEANUP_CONFIG`.

## Audit log

By default logs are written to:

- `~/.disk-cleanup-tui/logs/cleanup.log`

Override with `--log-file`.

## Publishing to npm

```bash
# Make sure you're logged in
npm login

# Publish
npm publish
```

## License

MIT
