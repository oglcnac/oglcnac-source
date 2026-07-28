# Deployment

Production uses GitHub Pages for the complete static site, including PRED-DL
browser inference. Linode serves only the retained legacy API during transition.
Keep deployments manual and explicit unless there is a clear reason to automate more.

## Before Deploying

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
npm run test:prediction
npm run test:hexnac
```

Deploy only from a clean source checkout unless you are deliberately testing local edits.

## Static Site

Source lives in `frontend/`. Deployment output lives in `/home/bach/oglcnac-static-site` and is pushed to `github.com/oglcnac/oglcnac`.

Deploy manually:

```bash
./scripts/deploy-frontend.sh
```

## Static Prediction Bundle

PRED-DL assets are tracked under `frontend/static/prediction/` and deploy with
the rest of `frontend/`. The browser golden-corpus test verifies exact displayed
parity with the Python reference and rejects API requests.

When model inputs or weights change, follow the export workflow in
`prediction-service/README.md` before deploying.

## Static HexNAcQuest

HexNAcQuest pages, its exact JavaScript model, the pinned CSV parser, tutorial
assets, and canonical example all deploy with `frontend/`. It has no Shiny,
WebR, or API runtime. `npm run test:hexnac` verifies the legacy R golden corpus
and the complete browser workflow. See `HEXNAC-QUEST.md`.

## Legacy Prediction Backend

```bash
cd prediction-service
docker compose up -d --build
curl http://127.0.0.1:8010/health
```

The container binds to `127.0.0.1:8010` and is exposed publicly only through the
API proxy. Keep it available through 2026-08-11 while static prediction is
monitored. The website must continue to work when this API is unavailable.

Runtime settings live in `prediction-service/.env`.
Do not commit secrets.

## API Proxy

The systemd unit in `ops/api-proxy/oglcnac-api-proxy.service` starts `prediction_api_proxy.py` from this source repo and binds port 80 for `api.oglcnac.org`.

Install/update:

```bash
sudo cp ops/api-proxy/oglcnac-api-proxy.service /etc/systemd/system/oglcnac-api-proxy.service
sudo systemctl daemon-reload
sudo systemctl restart oglcnac-api-proxy
```

Expected local checks:

```bash
curl -s -H 'Host: api.oglcnac.org' http://127.0.0.1/health
curl -s -o /tmp/local-root.txt -w '%{http_code}\n' -H 'Host: oglcnac.org' http://127.0.0.1/
```

The API host should return `200`; the non-API host should return `404`.

## After Deploying

```bash
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
npm run smoke:static
npm run smoke:static:browser
```

After 14 clean days, retire the API proxy/backend in a separate, explicitly
approved operation. DNS and service shutdown are intentionally not part of a
normal frontend deployment.
