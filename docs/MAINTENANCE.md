# Maintenance

Use this checklist for routine checks, small content changes, and production updates.

## Current Production Shape

```text
Source repo:        /home/bach/oglcnac-source
Frontend deploy:   /home/bach/oglcnac-static-site
Public site:       https://oglcnac.org/
Public API:        https://api.oglcnac.org/
Prediction backend 127.0.0.1:8010
```

Atlas and OGT-PIN are static frontend data. O-GlcNAcPRED-DL is the only backend.

## Health Check

Run from `/home/bach/oglcnac-source`:

```bash
git status --short --branch
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
npm run smoke:static
npm run smoke:static:browser
```

Expected result:

```text
source repo is clean or only has intended edits
site returns 200
API health returns 200
smoke tests pass
```

## Frontend Update

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
git add frontend docs scripts README.md package.json package-lock.json
git commit -m "Describe the frontend update"
git push
./scripts/deploy-frontend.sh
```

After deployment:

```bash
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
npm run smoke:static
```

## Prediction Backend Restart

```bash
cd /home/bach/oglcnac-source/prediction-service
sudo docker compose up -d --build
curl -s http://127.0.0.1:8010/health
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
```

Runtime settings live in `prediction-service/.env`. Do not commit that file.

## API Proxy Restart

```bash
cd /home/bach/oglcnac-source
sudo cp ops/api-proxy/oglcnac-api-proxy.service /etc/systemd/system/oglcnac-api-proxy.service
sudo systemctl daemon-reload
sudo systemctl restart oglcnac-api-proxy
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
```

## Before Committing

```bash
git status --short
git diff --stat
git diff --check
```

Do not commit:

- `prediction-service/.env`
- local data dumps
- screenshots from `visual-review/`
- caches such as `__pycache__/`
- files from old archived folders
