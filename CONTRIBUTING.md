# Contributing to vazr

Thanks for considering a contribution. vazr is a small, focused tool — contributions should stay aligned with that.

## Getting started

```bash
git clone https://github.com/lechakrawarthy/vazr
cd vazr
npm install
node index.js --dry-run
```

## What we're looking for

- Bug fixes with a clear reproduction case
- New scan categories (with justification for why they belong)
- Cross-platform compatibility improvements (especially macOS/Linux edge cases)
- UX improvements to the interactive checkbox UI
- Documentation fixes

## What we're not looking for right now

- Major architectural rewrites
- Feature requests without an associated issue discussion first

## How to contribute

1. Check open issues first — especially ones tagged `good first issue`
2. Open an issue before starting significant work (saves time for both of us)
3. Fork the repo and create a branch: `git checkout -b fix/your-description`
4. Make your changes and test on your platform
5. Open a PR against `main` with a clear description of what and why

## Code style

- No transpilation — plain Node.js, CommonJS
- Existing code style is the guide — match it
- Test your change with `--dry-run` before submitting

## Issues

Found a bug? Open an issue with:
- Your OS and Node.js version
- The command you ran
- What you expected vs what happened

## License

By contributing, you agree your changes will be released under the MIT license.
