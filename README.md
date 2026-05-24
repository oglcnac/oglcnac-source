# O-GlcNAc Source

This is the source monorepo for the public O-GlcNAc website and prediction backend.

Production is split into two repositories:

- Source repository: `github.com/oglcnac/oglcnac-source`
- GitHub Pages deployment repository: `github.com/oglcnac/oglcnac`

The deployment repository contains the generated/static public site for `https://oglcnac.org/`. This source repository contains the editable source layout and backend service code.

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
