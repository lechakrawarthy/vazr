# Development Setup Guide

## Prerequisites

- Node.js 18 or later
- npm 8 or later
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/lechakrawarthy/vazr.git
cd vazr
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the CLI Locally

```bash
# Run with node directly
node ./bin/vazr.js

# Or use npm start
npm start

# With flags
node ./bin/vazr.js --dry-run
node ./bin/vazr.js --help
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm test -- --watch
```

## Project Structure

```
vazr/
├── bin/
│   └── vazr.js           # CLI entry point
├── src/
│   ├── index.js          # Main logic
│   ├── scanner.js        # Directory scanning (async)
│   ├── executor.js       # File operations (move/delete)
│   ├── config.js         # Config file parsing
│   ├── platform.js       # OS-specific logic
│   ├── logger.js         # Logging utilities
│   ├── validators.js     # Input validation
│   └── tui/              # Terminal UI components
│       ├── screen.js     # Main TUI layout
│       ├── review.js     # Review screen logic
│       ├── input.js      # Input handling
│       └── tokens.js     # UI styling
├── test/
│   ├── scanner.test.js
│   ├── executor.test.js
│   └── platform.test.js
└── package.json
```

## Key Files to Understand

### `src/scanner.js`
The core scanning logic. Uses async/await with a concurrency limiter to scan directories efficiently.

**Key exports:**
- `scanDirectory(path, options)` — Recursively scans a directory and returns categorized files

### `src/executor.js`
Handles file operations: moving and deleting files safely.

**Key exports:**
- `moveFiles(files, target)` — Move files to target drive
- `deleteFiles(files)` — Delete files (to Trash/Recycle Bin by default)

### `src/tui/screen.js`
Interactive checkbox UI for selecting files to act on.

**Key exports:**
- `promptForFiles(files, options)` — Show interactive prompt with categories

## Making Changes

### For New Scan Categories

1. Edit `src/scanner.js` — Add pattern matching in the relevant scan function
2. Add tests in `test/scanner.test.js`
3. Update README with the new category
4. Update CHANGELOG.md

### For New CLI Flags

1. Edit `bin/vazr.js` — Add `.option()` to the commander setup
2. Pass the option through to the relevant functions
3. Add tests for the new behavior
4. Update CONTRIBUTING.md if the feature is significant

### For TUI Changes

1. Edit relevant file in `src/tui/`
2. Test manually with `npm start`
3. Add tests if possible
4. Update documentation if user-visible

## Testing

Tests use Node's built-in test runner. Run with:

```bash
npm test
```

### Writing Tests

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { yourFunction } = require('../src/module.js');

test('describes what should happen', () => {
  const result = yourFunction(input);
  assert.strictEqual(result, expected);
});
```

## Code Style

- No transpilation — plain Node.js with CommonJS
- Follow existing code style
- Use 2-space indentation
- Use descriptive variable names
- Add comments for complex logic

## Before Submitting a PR

- [ ] Code follows project style
- [ ] Tests pass: `npm test`
- [ ] CLI smoke test: `npm start -- --help`
- [ ] No new npm audit warnings: `npm audit`
- [ ] Tested on your platform (Windows/macOS/Linux)
- [ ] Updated CHANGELOG.md if adding a feature
- [ ] Updated README if behavior changed

## Getting Help

- Check existing issues and discussions
- Ask in PRs or issues before starting large changes
- Review the CONTRIBUTING.md guide

## Useful Commands

```bash
# Run tests with verbose output
npm test -- --verbose

# Audit for security vulnerabilities
npm audit

# Check code for issues (if linter installed)
npm run lint

# Format code (if formatter installed)
npm run format
```

Happy contributing! 🎉
