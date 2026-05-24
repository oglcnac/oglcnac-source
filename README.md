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

## Deploy Frontend

The frontend deployment target is `/home/bach/oglcnac-static-site`, whose git remote is `github.com/oglcnac/oglcnac`.

```bash
./scripts/deploy-frontend.sh
```

## Deploy Prediction Service

```bash
cd prediction-service
docker compose up -d --build
curl http://127.0.0.1:8010/health
```

Runtime secrets live in `prediction-service/.env` and are intentionally not tracked.

## Deploy API Proxy

```bash
sudo cp ops/api-proxy/oglcnac-api-proxy.service /etc/systemd/system/oglcnac-api-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable oglcnac-api-proxy
sudo systemctl restart oglcnac-api-proxy
```

## Verify

```bash
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
```

## Static Data

Atlas and OGT-PIN data bundles are checked into `frontend/static/data/`.
Regenerate them only when the source database changes:

```bash
python3 frontend/scripts/generate_static_data.py --database /path/to/db.sqlite3
```

Do not use the archived legacy folders for normal development.
