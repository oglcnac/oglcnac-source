# Clean-room rebuild

A machine containing only Git, Node.js/npm, Python 3, and `rsync` can rebuild
and deploy the complete website from the source repository. No database,
application server, Docker image, private model file, or old server directory
is required.

## Rebuild from a clean clone

```bash
git clone https://github.com/oglcnac/oglcnac-source.git
cd oglcnac-source
npm ci
npm run build:site
npm run qa:repository
npm run test:site
```

The generated `dist/` directory is the complete GitHub Pages payload:

```text
site/ + public/ --scripts/build_site.py--> dist/
```

- `site/` owns HTML, shared page structure, and CSS sources.
- `public/` owns datasets, model files, browser libraries, images, and other
  files copied byte-for-byte.
- `dist/` is ignored build output and can be deleted at any time.
- `static/.site-build-assets.json` inside `dist/` records all output hashes and
  enables strict drift checks.

The build is offline. Network access is needed only to install npm packages on
a new machine and to push a deployment.

## Full verification

```bash
npm run qa:pr
npm run test:tables:browser
npm run test:prediction:browser
npm run test:hexnac:browser
```

If browsers are not yet installed, install the Playwright browsers using the
version pinned by `package-lock.json`, then rerun the browser gates.

## Deploy the rebuild

After the source commit is reviewed, committed, and pushed:

```bash
./scripts/deploy-frontend.sh
```

The Pages checkout exists only in a temporary directory during this command.
The resulting deployment commit records the exact source commit. See
`DEPLOYMENT.md` for verification and rollback.

## Recovery invariants

- Treat `github.com/oglcnac/oglcnac-source` as authoritative.
- Treat `github.com/oglcnac/oglcnac` as replaceable generated output.
- Never recover from or hand-edit an old server checkout when source history is
  available.
- Keep Atlas dataset-I (unambiguous) separate from dataset-II (ambiguous).
- Do not add runtime secrets or `.env` files; the public site needs none.
- The R curator package may be cloned separately but is not needed to build or
  serve the website.
