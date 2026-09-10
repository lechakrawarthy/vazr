# Architecture

This document explains the internal structure and design of vazr.

## Overview

vazr is a terminal-based utility for finding and removing disk bloat. It consists of three main phases:

1. **Scanning** — Recursively find files matching various bloat patterns
2. **Selection** — Interactive UI to select what to keep or remove
3. **Execution** — Move or delete selected files

## Scanning (`src/scanner.js`)

The scanner runs asynchronously with a configurable concurrency limit to avoid overwhelming the system.

### Key Concepts

**Concurrency Limiter:**
```javascript
// Max 16 simultaneous I/O operations
const limiter = new ConcurrencyLimiter(16);
```

This prevents excessive filesystem load on large codebases while maintaining speed.

**Categorization:**
Files are categorized into buckets during scanning:
- `tempCache` — /tmp, browser caches, npm caches
- `downloads` — Old files in Downloads folder
- `largeMedia` — Videos, ISOs, archives > 100MB
- `devArtifacts` — node_modules, build/, dist/, etc.
- `otherLarge` — Catch-all for large files

**Since v1.4, one walk does the work of four:** `devArtifacts`, `largeMedia`,
`otherLarge`, and `downloads` used to each independently walk the project
directories and/or Downloads folder — the same tree, re-read up to four times.
`scanner.scanWorkspace()` now walks each root exactly once and classifies every
entry as it's encountered: a directory matching a known artifact name (e.g.
`node_modules`) is sized and not descended into further; everything else is
checked against the media/large-file thresholds; Downloads additionally gets an
age check. The original single-purpose functions (`scanDevArtifacts`,
`scanLargeMedia`, `scanLargeFiles`, `scanOldDownloads`) still exist and are
still tested — `scanWorkspace` is what production actually calls.

`--exclude <path>` (or `excludePaths` in a config file) prunes a subtree before
it's even read, which both narrows results and cuts scan time on large
irrelevant directories.

### Scanner Output

```javascript
{
  tempCache: [
    { path: '/Users/you/.npm', size: 524288000 },
    // ...
  ],
  downloads: [ /* ... */ ],
  // ...
}
```

## Execution (`src/executor.js`)

Handles the actual file operations: moving and deleting.

### Safety Model

- **Default:** Files go to OS Trash/Recycle Bin (safe delete)
- **--force-delete:** Permanent deletion (requires confirmation)
- **--target:** Move to external drive instead of deleting

### Error Handling

Continues processing even if some files fail. Returns a summary of successes/failures.

## TUI (`src/tui/`)

Interactive selection interface built with `inquirer` library.

### Structure

- `screen.js` — Main layout and prompt orchestration
- `review.js` — Review-and-confirm screen
- `input.js` — Input handling and validation
- `tokens.js` — UI styling (colors, formatting)

### Interaction Flow

```
1. Display categories with checkboxes
2. User selects files with space/arrow keys
3. Review screen shows selected files
4. Confirm deletion/move
5. Execution begins
```

## Config System (`src/config.js`)

Loads settings from:
1. Command-line flags (highest priority)
2. `VAZR_CONFIG` environment variable
3. `~/.vazr/config.json` or `~/.vazr.json`
4. Built-in defaults (lowest priority)

### Config File Format

```json
{
  "target": "H:\\archive",
  "minMediaMB": 100,
  "minLargeMB": 500,
  "oldDays": 60,
  "logFile": "~/.vazr/logs/cleanup.log",
  "forceDelete": false
}
```

## Logging (`src/logger.js`)

All operations are logged to `~/.vazr/logs/cleanup.log` with:
- Timestamp
- Operation (scan, move, delete)
- File path
- Result (success/error)

## Platform Abstraction (`src/platform.js`)

Handles OS-specific operations:
- Detecting home directory
- Finding Downloads/Temp folders
- Using appropriate Trash/Recycle Bin API

Currently supports:
- Windows (via `trash` npm package)
- macOS (via `trash` npm package)
- Linux (via `trash` npm package)

## Entry Point (`bin/vazr.js`)

CLI setup using `commander` library. Orchestrates:
1. Parse arguments
2. Load config
3. Run scanner
4. Show TUI
5. Execute operations
6. Log results

## Performance Considerations

### Async/Await with Concurrency Limiter
Instead of `Promise.all()` (which would spawn unlimited tasks), we use a limiter:

```javascript
for (const dir of directories) {
  await limiter.run(() => readDirectory(dir));
}
```

This balances speed with system resource usage.

### Caching
Directory metadata is not cached (to show current state), but could be added if scanning large repos repeatedly becomes a bottleneck.

## Testing Strategy

Tests use Node's built-in `test` module. Key test areas:

1. **Scanner tests** — Verify pattern matching and categorization
2. **Executor tests** — Verify move/delete operations on mock files
3. **Platform tests** — Mock OS-specific operations
4. **Config tests** — Verify config loading and merging

## Future Improvements

- [x] Profile and optimize I/O on very large codebases — v1.4 collapsed the four
      overlapping full-tree scans into one unified walk (`scanWorkspace`)
- [ ] Add caching layer for repeated scans
- [ ] Add plugin system for custom scan categories
- [ ] Support for Windows Event Logs integration
- [ ] Scheduler for automated cleanup
