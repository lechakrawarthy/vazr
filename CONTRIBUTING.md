# Contributing to vazr

Thanks for considering a contribution. vazr is a small, focused tool — contributions should stay aligned with that.

## Never opened a pull request before? Start here.

You don't need git, Node.js, or a terminal for most issues labeled [`good first issue`](https://github.com/lechakrawarthy/vazr/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — many of them are doc/text edits you can do entirely in the browser:

1. Open the file GitHub tells you to edit (the issue will link it, e.g. `README.md`).
2. Click the pencil icon (✏️) in the top-right corner of the file to edit it in your browser.
3. Make the change exactly as described in the issue.
4. Scroll down, add a short commit message, and choose **"Create a new branch and start a pull request."**
5. Click **Propose changes**, then **Create pull request**.

That's it — no install required. If a step in an issue doesn't make sense, comment on the issue and ask; that's normal, not a bother.

**Before you start:** comment on the issue (e.g. "I'd like to try this") so two people don't work on the same thing at once. If someone's already claimed it, look for another open `good first issue` — there's always more than one.

**If your PR hits a merge conflict** because someone else's change landed first: that's expected, especially during Hacktoberfest when several people grab similar issues. It's not a mistake on your part — ask for help in the PR and we'll sort it out together.

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
