# Deployment and rollback

The website is a static GitHub Pages deployment. The only production website
service is `https://oglcnac.org/`; there is no prediction API, proxy, container,
database, or Shiny runtime.

## Prerequisites

- a clean clone of `github.com/oglcnac/oglcnac-source`;
- Node.js/npm, Python 3, Git, and `rsync`;
- push access to both the source and Pages repositories.

Install dependencies and run the release gates:

```bash
npm ci
npm run qa:pr
npm run test:tables:browser
npm run test:prediction:browser
npm run test:workbench:browser
npm run test:hexnac:browser
npm run test:accessibility:browser
```

Review, commit, and push all source changes. Deployment intentionally refuses a
dirty tree or a local commit that is not `origin/master`.

## Publish

```bash
./scripts/deploy-frontend.sh
```

The script performs the following bounded workflow:

1. Builds and audits the public-only artifact in a temporary directory; unpublished research pages, scripts, data, and styles are excluded.
2. Temporarily clones `https://github.com/oglcnac/oglcnac.git`.
3. Replaces that clone's public files with the reviewed build.
4. Commits a `Source-Commit: <sha>` trailer and pushes `master`.
5. Deletes the temporary build and clone automatically.

No permanent deployment checkout is required or supported. Never edit the
Pages repository to make a source change.

Useful optional environment variables are `DEPLOY_REPOSITORY_URL`,
`DEPLOY_BRANCH`, `COMMIT_MESSAGE`, `DEPLOY_GIT_NAME`, and `DEPLOY_GIT_EMAIL`.
By default the temporary deploy commit uses the source repository's local Git
identity. `SKIP_SOURCE_STATE_CHECK=1` exists only for isolated integration
tests and must not be used for production.

## Verify production

```bash
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
npm run smoke:static
npm run smoke:static:browser
```

The browser checks exercise all tools without permitting an API fallback.

## CI browser environment

All three browser workflows use Ubuntu 24.04 runners and the official
`mcr.microsoft.com/playwright:v1.60.0-noble` test image. Browsers and their OS
libraries are already installed in that image; jobs must not reinstall them
through `apt`. This avoids both unsupported `ubuntu-latest` upgrades and package
mirror stalls consuming the job's time limit. Python 3.12 is set up separately
for the static build and archive checks.

When upgrading Playwright, update `package-lock.json` and all four browser job
image references together. Run `workflow_dispatch` for Static site quality,
Prediction browser smoke, and HexNAcQuest browser smoke to verify Chromium,
Firefox, and WebKit. Push checks exercise Chromium only.

Each prediction reference fixture gets a fresh page and a bounded inference
budget (two minutes, or four minutes for fixtures with more than 1,000 sites).
Every expected row is still compared exactly. Application errors fail promptly;
timeouts log the fixture, prediction stage, progress, and network failures.
Production smoke checks continue to fail on HTTP errors, including model 503s.

## Roll back a Pages deployment

Find the exact bad commit in `oglcnac/oglcnac`, then run:

```bash
./scripts/rollback-frontend.sh DEPLOY_COMMIT
```

The rollback helper uses a temporary clone, verifies that the requested commit
belongs to the deployment branch, creates a revert commit, pushes it, and
removes the clone. Revert or repair the corresponding source commit separately
so the next normal deployment cannot reintroduce the defect.
