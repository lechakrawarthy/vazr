# NPM Publish Notes (Study Later)

This is the short version of what to remember when local npm login is blocked.

## Why this exists

- Local publish can fail when npm login or 2FA is unavailable.
- GitHub Actions can publish using an npm token stored as a repo secret.
- Result: release is still possible without signing in on your laptop.

## How this repo publishes now

- Workflow file: .github/workflows/publish.yml
- Triggers:
  - Push tag that starts with `v` (example: `v1.3.1`)
  - Manual run from GitHub Actions (`workflow_dispatch`)
- Safety checks before publish:
  - `npm ci`
  - `npm test`
  - On tag pushes: tag version must match `package.json` version
- Publish command:
  - `npm publish --access public --provenance`

## One-time setup (GitHub)

1. Go to repository Settings -> Secrets and variables -> Actions.
2. Add a secret named `NPM_TOKEN`.
3. Token type should be npm automation token with publish permission for `@lechakrawarthy/vazr`.

## Normal release flow (recommended)

1. Update version:
   - `npm version patch` (or `minor`/`major`)
2. Push branch and merge to main.
3. Push tag:
   - `git push origin vX.Y.Z`
4. Watch Actions -> Publish workflow.
5. Confirm package on npm:
   - `npm view @lechakrawarthy/vazr version`

## If npm account is temporarily blocked

- You cannot publish directly from your laptop.
- Use one of these now:
  - Tag-based GitHub Actions publish (if `NPM_TOKEN` secret is already set)
  - Ask collaborator with active npm access to publish
  - Temporary install from GitHub branch:
    - `npm i github:lechakrawarthy/vazr#fix/cli-option-runs`

## Quick mental model

- Local login path: your machine identity.
- GitHub Actions path: repository secret identity.
- If one path is blocked, use the other.
