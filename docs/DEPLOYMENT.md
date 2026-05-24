# Deployment

Production uses GitHub Pages for the static site and Linode only for `api.oglcnac.org`.
Keep deployments manual and explicit unless there is a clear reason to automate more.

## Before Deploying

```bash
git status --short --branch
npm run smoke:static
npm run smoke:static:browser
```

Deploy only from a clean source checkout unless you are deliberately testing local edits.

## Static Site

Source lives in `frontend/`. Deployment output lives in `/home/bach/oglcnac-static-site` and is pushed to `github.com/oglcnac/oglcnac`.

Deploy manually:

```bash
./scripts/deploy-frontend.sh
```

## Prediction Backend

```bash
cd prediction-service
docker compose up -d --build
curl http://127.0.0.1:8010/health
```

The container binds to `127.0.0.1:8010` and is exposed publicly only through the API proxy.

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
```
