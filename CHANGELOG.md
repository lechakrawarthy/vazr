# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/lechakrawarthy/vazr/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.1.0
[1.0.4]: https://github.com/lechakrawarthy/vazr/releases/tag/v1.0.4
