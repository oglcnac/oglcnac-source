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
npm run test:hexnac:browser
```

Review, commit, and push all source changes. Deployment intentionally refuses a
dirty tree or a local commit that is not `origin/master`.

## Publish

```bash
./scripts/deploy-frontend.sh
```

The script performs the following bounded workflow:

1. Builds and audits the complete site in a temporary directory.
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

## Roll back a Pages deployment

Find the exact bad commit in `oglcnac/oglcnac`, then run:

```bash
./scripts/rollback-frontend.sh DEPLOY_COMMIT
```

The rollback helper uses a temporary clone, verifies that the requested commit
belongs to the deployment branch, creates a revert commit, pushes it, and
removes the clone. Revert or repair the corresponding source commit separately
so the next normal deployment cannot reintroduce the defect.
