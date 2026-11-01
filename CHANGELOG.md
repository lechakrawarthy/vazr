# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] — Unreleased

The precision release: choose exactly what goes, and take it back if you were wrong.

### Added
- **Item picker.** `→` (or `Tab`) on a category lists its items largest-first; `Space` toggles one, `A` all or none, `←` goes back. The category row then shows only what is still selected, e.g. `Temp & Cache (12/40)`, and only those items are processed
- **Undo.** Every real run is journaled to `~/.vazr/history` (newest 20 kept). `vazr undo [id]` moves files back where they came from, never overwriting anything new at the original path, and says where deleted items went. `vazr history` lists runs
- **Tool Caches category:** npm, pnpm store, Yarn, pip, Go build cache, Cargo registry and sources, Gradle, NuGet, Playwright and Puppeteer browsers, Xcode DerivedData. Never pre-selected. `~/.m2` and `~/go/pkg/mod` are deliberately left alone
- **Unattended runs:** `--yes` with `--only <keys>` or `--profile` cleans without the TUI or prompts, records the run for undo, and exits 2 if anything failed. It refuses `--force-delete`

### Changed
- `--only` and profiles now skip scans the selected categories don't need: `--only caches` went from 7m48s to 15s on a real machine
- Plans are built and run in one place (`src/plan.js`), shared by the review screen and `--yes`

## [1.5.0] — Unreleased

The trust release: vazr should never offer to delete something it can't justify.

### Added
- **Project-aware dev artifacts.** A folder is only flagged when its project proves what it is: `node_modules` needs a `package.json` beside it, `target/` needs `Cargo.toml`/`pom.xml`/`build.sbt`, `build/` needs a Node/Gradle/Flutter/CMake/Python project, `.venv` needs a `pyvenv.cfg` inside, and so on. A hand-made `Documents/build` or `Taxes/out` folder is no longer a candidate for deletion
- New ecosystems: .NET (`bin/`, `obj/` beside a `*.csproj`), Python (`.venv`, `venv`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`), Angular, Dart/Flutter, Swift, Elixir, Haskell, Zig. Every artifact is tagged with its ecosystem in `--export` output
- **Idle vs. active projects.** vazr reads each project's last activity (top-level files plus the git index/HEAD) and splits dev artifacts into *idle 30d+* (pre-selected) and *active projects* (shown, never pre-selected). `--stale-days <n>` (or `staleDays` in config/profiles) sets the threshold
- Every delete and move now passes a last-line safety check: filesystem roots, the home folder, scan roots themselves, and protected system directories are refused, even if something upstream got it wrong. Dry runs report these refusals too

### Fixed
- `--export` asked an interactive destination question before scanning, so it crashed in CI and pipes, and in a terminal the prompt and the scan animation were written into `--export json > report.json`. Export now never prompts, and stdout carries only the report (progress goes to stderr when it's a terminal)
- Temp files were listed and counted twice on Windows and Linux, because `os.tmpdir()` is the same folder as an explicit temp path
- With sort set to `name` or `count`, the review screen highlighted one row while Space toggled a different one
- A checked category shown as "──────" (no destination for a move) silently ran as a delete. It now shows `SKIP (D/M)` and is left alone unless you pick an action
- An old download that was also large was put in two categories, inflating the total and acting on it twice
- `.git` folders are no longer walked, so pack files can't show up as "Other Large Files" (and scans are faster)
- `vazr profile import -` now reads stdin on Windows
- Running the interactive mode without a terminal now explains what to do instead of hanging

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
