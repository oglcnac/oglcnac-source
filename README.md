# O-GlcNAc Source

This is the source monorepo for the public O-GlcNAc website and the retained
prediction reference service.
Use this repository for new development.

Production is intentionally simple:

- `frontend/` is the editable static website source.
- `prediction-service/` is the Python reference implementation used to export
  and verify the static browser predictor.
- `ops/api-proxy/` retains the old prediction API during its transition period.
- `/home/bach/oglcnac-static-site` is the generated GitHub Pages deploy checkout.

The generated deploy checkout is pushed to `github.com/oglcnac/oglcnac`.
This source repository is pushed to `github.com/oglcnac/oglcnac-source`.

## Layout

```text
frontend/              Static website source for GitHub Pages
prediction-service/    FastAPI O-GlcNAcPRED-DL backend
ops/api-proxy/         Linode API-only proxy for api.oglcnac.org
scripts/               Local deployment helpers
docs/                  Operational notes
```

## Public Services

```text
https://oglcnac.org/              Static frontend on GitHub Pages
https://api.oglcnac.org/health    Legacy prediction API during transition
```

Atlas, OGT-PIN, and PRED-DL run fully in the browser from versioned static
assets. PRED-DL uses TensorFlow.js with the WASM backend; protein sequences do
not leave the browser.

## Daily Checks

From this repository:

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
```

The smoke tests check every public page, static data, static prediction assets,
and browser prediction parity without contacting the API.

## Common Workflows

- Deployment: see `docs/DEPLOYMENT.md`.
- Maintenance checklist: see `docs/MAINTENANCE.md`.
- Data updates: see `docs/DATA-UPDATES.md`.
- Curator workflow: see `docs/CURATOR-WORKFLOW.md`.
- Frontend source notes: see `frontend/README.md`.
- Static prediction architecture and transition: see `docs/STATIC-PREDICTION.md`.
- Prediction export/reference-service notes: see `prediction-service/README.md`.

## Do Not Commit

- Secrets or local runtime files such as `prediction-service/.env`.
- Generated visual review screenshots.
- Python caches, logs, or local virtual environments.
- Files from archived legacy folders unless doing explicit historical recovery.
