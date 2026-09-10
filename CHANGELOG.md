# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] — 2026-09-11

### Changed
- **Scan performance:** replaced four separate, overlapping filesystem walks (dev artifacts, large media, catch-all large files, old downloads) with a single unified pass over the same directory trees. Measured on a real dev machine: ~58% fewer `readdir` calls, ~50% fewer `stat` calls, and roughly 1.5x faster wall-clock scans — the gap widens further on machines with several large `node_modules` trees, since those no longer get re-walked three times over
- A large file inside a matched dev-artifact folder (e.g. a big binary in `node_modules`) is now reflected once, in that folder's total, instead of also being separately listed under "Other Large Files"
- The scan screen now shows a live "~X reclaimable" estimate that updates as the scan runs, instead of only revealing the total once scanning finishes

### Added
- `--exclude <paths>` — skip specific paths during scanning (comma-separated, repeatable, also settable via config file `excludePaths`). Excluded directories are pruned before they're even read, so this is a real performance lever too, not just filtering
- `--verbose` — prints which roots are being scanned, which artifact folders are matched, and which paths get skipped, to stderr
- Non-blocking, opt-out update check: prints a one-line notice at the end of a run if a newer version is published to npm. Never delays scanning, fails silently offline, and respects `CI`/`NO_UPDATE_NOTIFIER` env vars and `--no-update-check`

## [1.3.2] — 2026-08-15

### Changed
- Updated the README quick-start command to prefer `npx @lechakrawarthy/vazr@latest` so npm docs point readers at the newest published release

## [1.3.1] — 2026-08-06

### Fixed
- Root CLI option runs (for example, --dry-run, --target, --export) no longer fall back to help output when no subcommand is provided
- Added a root Commander action so option-only invocations correctly continue into main scan flow

## [1.1.0] — 2026-05-13

### Added
- Async scanner with 16-slot concurrency limiter for improved I/O performance
- Interactive checkbox UI for selecting files to delete or move
- Dashboard-style summary with category breakdown and largest-file preview
- Audit logging to `~/.vazr/logs/cleanup.log`
- JSON config file support for repeatable runs
- Safe delete mode by default (moves to OS Trash/Recycle Bin)
- `--dry-run` mode for safe preview
- Cross-platform support (Windows, macOS, Linux)
- Scan categories: temp/cache, old downloads, large media, dev artifacts, large files

### Fixed
- Improved error handling for missing or unavailable target drives
- Better handling of permission-denied errors during scans

## [1.0.4] — 2026-04-04

### Added
- Initial npm release
- Basic CLI interface
- Synchronous scanner
- Move and delete functionality
- Platform detection

[Unreleased]: https://github.com/lechakrawarthy/vazr/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.4.0
[1.3.2]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.3.2
[1.3.1]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.3.1
[1.3.1]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.3.1
[1.1.0]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.1.0
[1.0.4]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.0.4
