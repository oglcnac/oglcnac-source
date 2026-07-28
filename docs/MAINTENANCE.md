# Maintenance

Use this checklist for routine checks, small content changes, and production updates.

## Current Production Shape

```text
Source repo:        /home/bach/oglcnac-source
Frontend deploy:   /home/bach/oglcnac-static-site
Public site:       https://oglcnac.org/
Static predictor:  /static/prediction/v1/
Legacy API:        https://api.oglcnac.org/ (transition through 2026-08-11)
Reference backend: 127.0.0.1:8010
```

Atlas and OGT-PIN use static frontend data. O-GlcNAcPRED-DL and HexNAcQuest
run locally in browser Web Workers. HexNAcQuest needs only its static
JavaScript, JSON model manifest, CSV parser, and public assets.

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
legacy API health returns 200 during transition
smoke tests pass
```

## Frontend Update

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
npm run test:prediction
npm run test:hexnac
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

## Static Prediction Verification

```bash
npm run test:prediction
```

This checks FASTA handling and exact human/mouse parity against the Python
golden corpus while blocking all prediction API requests. The scheduled GitHub
Actions workflow runs the same check daily.

## HexNAcQuest Verification

```bash
npm run test:hexnac
```

This checks the CSV contract, all 10,000 legacy R reference classifications,
the complete browser workflow, and the absence of prediction API or
shinyapps.io requests. The scheduled three-browser workflow runs daily.

## Reference Backend Restart

```bash
cd /home/bach/oglcnac-source/prediction-service
sudo docker compose up -d --build
curl -s http://127.0.0.1:8010/health
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
```

Runtime settings live in `prediction-service/.env`. Do not commit that file.

The reference backend is not called by the website. Keep it available through
2026-08-11 for transition monitoring. Retirement after that date requires a
separate explicit decision; do not remove DNS, the proxy, or model sources as
part of routine frontend maintenance.

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
