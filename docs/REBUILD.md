# Rebuild The Complete Static Suite

This repository is sufficient to rebuild the public static site after the old
web server is removed. Once the pinned npm/Playwright dependencies are
installed, site and data reconstruction is offline and deterministic: it uses
tracked sources and does not contact UniProt, the legacy prediction API, or
shinyapps.io. A fresh `npm ci` or Playwright browser installation can require
network access to its package registries.

## Required Tools

- Git
- Python 3.10 or newer (the site and data generators use the standard library)
- Node.js 20 and npm
- For a prediction-model re-export only: a Python virtual environment and
  `prediction-service/browser-export-requirements.txt`
- For browser QA: Playwright browsers installed with
  `npx playwright install --with-deps chromium firefox webkit`
- For deployment: `rsync`, Git credentials with write access to
  `github.com/oglcnac/oglcnac`, and a deploy checkout

## Source And Generated Ownership

| Tracked source | Generated output | Command |
| --- | --- | --- |
| `site/site.json`, templates, pages, styles, and assets | public HTML, `app.css`, generated SVG artwork, and `.site-build-assets.json` | `npm run build:site` |
| Atlas 4.0/5.0 and OGT-PIN CSVs in `frontend/static/dataset/` | `frontend/static/data/*.json` and `*.json.gz` | `frontend/scripts/generate_static_data.py` |
| controlled Atlas FASTA or the tracked sequence snapshot | `atlas-sequences-v1.json` and `.gz` | sequence commands in `CURATOR-WORKFLOW.md` |
| H5, AAindex, and word2vec sources in `prediction-service/prediction_model/` | `frontend/static/prediction/v1/` | `export_browser_predictor.py` |
| pinned npm packages in `package-lock.json` | self-hosted TensorFlow.js/WASM and Papa Parse vendor files | vendor commands below |

HexNAcQuest's model contract, worker, UI, tutorial figures, canonical CSV, and
license are tracked public inputs, not template-builder outputs. Scientific
evidence/network figures, downloadable releases, example FASTA, citations, and
model assets are likewise retained inputs. Never remove one merely because
`npm run build:site` does not generate it.

## Clean Rebuild

From a fresh clone:

```bash
git clone https://github.com/oglcnac/oglcnac-source.git
cd oglcnac-source
npm ci
npm run build:site
npm run qa:pr
npx playwright install --with-deps chromium
npm run test:tables:browser
npm run test:prediction:browser
npm run test:hexnac:browser
```

`npm run qa:repository` verifies generated-output drift, every configured HTML
route, internal assets (including `srcset` and CSS URLs), orphaned public
code/media, and forbidden external runtime scripts/styles. Runtime-selected
prediction directories preserve all three WASM variants.

For a release audit, repeat the browser suites with each engine:

```bash
SITE_BROWSER=firefox npm run test:tables:browser
SITE_BROWSER=webkit npm run test:tables:browser
PREDICTION_BROWSER=firefox npm run test:prediction:browser
PREDICTION_BROWSER=webkit npm run test:prediction:browser
HEXNAC_BROWSER=firefox npm run test:hexnac:browser
HEXNAC_BROWSER=webkit npm run test:hexnac:browser
```

## Rebuild Data And Models

Regenerate canonical data with the exact command and count checks in
`CURATOR-WORKFLOW.md`. Do not fetch sequences during a normal rebuild; the
tracked snapshot is the reproducible input. A network update needs a persistent
non-secret cache, bounded batches, and complete provenance.

Re-export PRED-DL only when tracked Python model inputs change:

```bash
python3 -m venv .venv
.venv/bin/pip install -r prediction-service/browser-export-requirements.txt
.venv/bin/python prediction-service/tools/export_browser_predictor.py
.venv/bin/python -m unittest scripts.tests.test_browser_export -v
npm run test:prediction
```

Refresh pinned vendor copies only after `npm ci` and a deliberate dependency
version change:

```bash
cp node_modules/@tensorflow/tfjs/dist/tf.min.js \
  frontend/static/prediction/vendor/tfjs-2.8.5/tf.min.js
cp node_modules/@tensorflow/tfjs-backend-wasm/dist/tf-backend-wasm.min.js \
  node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm*.wasm \
  frontend/static/prediction/vendor/tfjs-2.8.5/
cp node_modules/papaparse/papaparse.min.js \
  frontend/static/hexnac-quest/vendor/papaparse.min.js
cp node_modules/papaparse/LICENSE \
  frontend/static/hexnac-quest/vendor/PAPAPARSE-LICENSE
npm run test:prediction
npm run test:hexnac
```

If a dependency version changes, use a new versioned vendor/model directory and
update manifests, paths, licenses, checksums, and parity fixtures together.

## Deploy Checkout, Verification, And Rollback

Recreate a deploy checkout removed during server cleanup:

```bash
git clone https://github.com/oglcnac/oglcnac.git \
  /home/bach/oglcnac-static-site
git -C /home/bach/oglcnac-static-site switch master
```

After review and approval, `./scripts/deploy-frontend.sh` rechecks build drift,
mirrors only `frontend/`, commits the deploy checkout, and pushes it. Record
both source and deploy commits. Verify with `DEPLOYMENT.md`.

The production Python smoke is portable and discovers its expected routes and
assets from this clone's `frontend/` by default:

```bash
python3 scripts/smoke_static_site.py --base-url https://oglcnac.org
```

Pass `--static-root /path/to/another/checkout` only when deliberately auditing
a different deploy tree.

Rollback is a Git revert, never an untracked file copy:

```bash
git -C /home/bach/oglcnac-static-site log --oneline -5
git -C /home/bach/oglcnac-static-site revert DEPLOY_COMMIT
git -C /home/bach/oglcnac-static-site push
npm run smoke:static
npm run smoke:static:browser
```

No secret is required to build or test. Git push credentials, server login, and
untracked `prediction-service/.env` are secrets/runtime state. CNAME, static
data, manifests, checksums, public API origin, and release provenance are
non-secret tracked configuration.

Through **2026-08-11**, retain the prediction reference backend, Python model
sources, API proxy, DNS, and health checks. The static website must not call
the API. Backend/proxy retirement, DNS removal, or shinyapps.io deletion is a
separate destructive operation requiring explicit approval.
