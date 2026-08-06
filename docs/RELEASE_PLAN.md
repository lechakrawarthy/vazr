# Release Plan (npm via GitHub Actions)

This is the exact plan to publish without local npm login.

## Do This Now (6 Steps)

1. Create an npm Automation token from npmjs.com.
2. Add it as GitHub repo secret named `NPM_TOKEN`.
3. Merge your release branch to `main`.
4. Confirm `package.json` version is the one you want to publish.
5. Push matching tag (`vX.Y.Z`) to trigger publish.
6. Verify publish with `npm view @lechakrawarthy/vazr version`.

## Goal

Publish `@lechakrawarthy/vazr` from GitHub Actions using `NPM_TOKEN`.

## Prerequisites

1. You have admin/maintainer access to this GitHub repository.
2. You can create an npm automation token for the package owner account.
3. Branch `fix/cli-option-runs` has the release automation changes.

## One-Time Setup Plan

1. Create npm automation token:
- npmjs.com -> account avatar -> Access Tokens -> Generate New Token -> Automation
- Copy the token value.

2. Add GitHub repository secret:
- GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
- Name: `NPM_TOKEN`
- Secret: paste npm automation token
- Save

3. Validate workflow exists:
- Check file: `.github/workflows/publish.yml`
- It supports tag trigger (`v*`) and manual trigger.

## Release Execution Plan

### Option A: Tag-based publish (recommended)

1. Ensure release branch is merged to `main`.
2. Confirm version in `package.json` is the target version (example `1.3.1`).
3. Create and push tag:

```bash
git checkout main
git pull origin main
git tag v1.3.1
git push origin v1.3.1
```

4. Observe workflow run:
- GitHub -> Actions -> Publish
- Confirm steps pass: install, test, tag-version check, publish

5. Verify npm:

```bash
npm view @lechakrawarthy/vazr version
```

### Option B: Manual workflow run

1. GitHub -> Actions -> Publish workflow
2. Click Run workflow
3. Choose `main` branch
4. Click Run workflow
5. Verify published version on npm

## Rollback / Failure Plan

1. If workflow fails before publish:
- Fix issue on branch
- Re-run workflow

2. If wrong version/tag mismatch:
- Update `package.json` version or push the correct tag
- Run again

3. If npm publish is rejected (auth/permission):
- Recheck `NPM_TOKEN` scope/account
- Ensure token belongs to package owner/org with publish rights

## Quick Checklist

- [ ] `NPM_TOKEN` exists in GitHub secrets
- [ ] Version bumped in `package.json`
- [ ] Branch merged to `main`
- [ ] Publish workflow completed successfully
- [ ] npm shows new version
