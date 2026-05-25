# O-GlcNAc Source

This is the source monorepo for the public O-GlcNAc website and prediction backend.
Use this repository for new development.

Production is intentionally simple:

- `frontend/` is the editable static website source.
- `prediction-service/` is the only backend.
- `ops/api-proxy/` forwards `api.oglcnac.org` traffic to the backend.
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
https://api.oglcnac.org/health    Prediction API proxy on Linode
```

Atlas and OGT-PIN run fully from static frontend data in `frontend/static/data/`. The only backend is the prediction service.

## Daily Checks

From this repository:

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
```

The smoke tests check the public site and public API.

## Common Workflows

- Deployment: see `docs/DEPLOYMENT.md`.
- Maintenance checklist: see `docs/MAINTENANCE.md`.
- Data updates: see `docs/DATA-UPDATES.md`.
- Frontend source notes: see `frontend/README.md`.
- Prediction backend notes: see `prediction-service/README.md`.

## Do Not Commit

- Secrets or local runtime files such as `prediction-service/.env`.
- Generated visual review screenshots.
- Python caches, logs, or local virtual environments.
- Files from archived legacy folders unless doing explicit historical recovery.
