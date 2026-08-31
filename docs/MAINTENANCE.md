# Maintenance checklist

## Architecture

`oglcnac.org` is one static GitHub Pages site built from this repository. Atlas
and OGT-PIN query bundled JSON. PRED-DL performs TensorFlow.js/WASM inference in
a Web Worker. HexNAcQuest parses CSV and scores it in a Web Worker. There are no
production server processes to restart.

The O-GlcNAc Workbench reuses the PRED-DL worker and joins its result locally
to the tracked Atlas and OGT-PIN JSON. It does not create a composite score.

## Before editing

```bash
git status --short --branch
git fetch origin
git rev-parse HEAD
git rev-parse origin/master
npm ci
```

Work only in `site/`, `public/`, `prediction-reference/`, `scripts/`, or `docs/`
as appropriate. Never edit `dist/` or the Pages repository.

## Verification matrix

For ordinary layout/content changes:

```bash
npm run build:site
npm run qa:repository
npm run test:site
```

For table/data changes:

```bash
npm run test:data
npm run test:tables:unit
npm run test:tables:browser
```

For PRED-DL changes:

```bash
npm run test:prediction:unit
npm run test:prediction:browser
```

For HexNAcQuest changes:

```bash
npm run test:hexnac:unit
npm run test:hexnac:browser
```

For Workbench or OGT-PIN summary changes:

```bash
npm run test:workbench:unit
npm run test:workbench:browser
npm run test:ogt-network:unit
```

Before every release, run the applicable focused checks plus `npm run qa:pr`.
Run `npm run test:accessibility:browser` for WCAG 2.2 AA checks.
Use `npm run screenshots` for a deliberate visual review after layout changes;
screenshots are review artifacts and are not committed.

## Commit and deploy

```bash
git diff --check
git status --short
git add <reviewed paths>
git commit -m "Describe the source change"
git push origin master
./scripts/deploy-frontend.sh
npm run smoke:static
npm run smoke:static:browser
```

The source must be clean and synchronized before deployment. The deploy helper
uses temporary build and Pages directories and cleans them automatically.

## Data releases

Follow `CURATOR-WORKFLOW.md`. Preserve the canonical CSVs, generated JSON and
gzip bundles, release metadata, Atlas sequence snapshot, provenance, and known
row-count assertions. Do not infer mappings for unresolved identifiers.

## Failure handling

- Build drift: delete the ignored `dist/`, rebuild, and inspect source changes.
- Browser regression: keep the failed release undeployed; fix source and rerun
  the focused browser suite.
- Bad deployment: use `scripts/rollback-frontend.sh DEPLOY_COMMIT`, then repair
  or revert source.
- Missing production files: rebuild and redeploy from a clean source commit;
  do not patch the Pages repository.
