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
npm run qa:repository
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
npm run qa:pr
npm run test:tables
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
npm run smoke:static:browser
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

## CI And Route/Asset Coverage

Pull requests and ordinary pushes run the repository/unit gate and Chromium
interaction QA. Scheduled and manually dispatched release audits expand site
interactions, PRED-DL, HexNAcQuest, and production smoke to Chromium, Firefox,
and WebKit. CI installs the selected locked Playwright browser with its OS
dependencies; local WebKit needs
`npx playwright install --with-deps webkit`.

`npm run qa:repository` is the authoritative pre-commit gate. Public route
coverage comes from `site/site.json`; the audit rejects a configured route with
no generated HTML and generated HTML absent from configuration. The internal
asset graph resolves root/document-relative HTML URLs, queries, fragments,
`srcset`, CSS URLs, JavaScript static paths, and runtime-selected directories.
It rejects missing targets and orphaned public CSS, JavaScript, raster, or SVG
files. `npm run check:site` separately rejects stale generated output.

See `REBUILD.md` for clean-room rebuild, source ownership, vendor/model refresh,
deploy-checkout recreation, verification, secrets, and rollback.

## Visual Release Audit

Serve the candidate `frontend/` locally, then capture the complete 39-state
matrix at 1440×1100 and 390×844:

```bash
python3 -m http.server 8771 --bind 127.0.0.1 --directory frontend
SCREENSHOT_BASE_URL=http://127.0.0.1:8771 \
SCREENSHOT_OUTPUT_DIR=/tmp/oglcnac-visual-review \
npm run screenshots
```

The command writes 78 full-page screenshots, desktop/mobile contact sheets,
and `report.json`. It fails for overflow, missing/multiple H1 elements,
unexpected console/page errors, or API/Shiny requests. Intentional Atlas and
OGT-PIN 503 fixtures are recorded separately from unexpected errors. Review
the contact sheets and representative full-page captures before deploying;
do not commit the generated images.

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
