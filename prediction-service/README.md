# O-GlcNAcPRED-DL Prediction Service

Python reference implementation for O-GlcNAcPRED-DL prediction.
It contains the model weights, AAindex files, word2vec models, model architecture code, Dockerfile, and Python dependencies.

The public website now runs the same ensemble locally in the browser from
versioned TensorFlow.js/WASM assets. This service remains online during the
14-day transition beginning 2026-07-28 and remains the oracle for export/parity
testing; the website does not call it or fall back to it.

## Export Browser Assets

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r prediction-service/browser-export-requirements.txt
.venv/bin/python prediction-service/tools/export_browser_predictor.py
.venv/bin/python -m unittest scripts.tests.test_browser_export
npm run test:prediction
```

The exporter writes `frontend/static/prediction/v1/manifest.json`, all ten
converted ensemble models, AAindex values, word2vec vectors, and SHA-256
checksums. Do not deploy a regenerated bundle unless the complete browser
golden corpus passes exactly.

## Run Locally

```bash
cd /home/bach/oglcnac-source/prediction-service
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:8010/health
```

## API

Public endpoint:

```text
POST /api/v1/predict
```

Headers:

```text
Content-Type: application/json
```

Body:

```json
{
  "species": "human",
  "fasta": ">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA"
}
```

Example:

```bash
curl -X POST http://127.0.0.1:8010/api/v1/predict \
  -H "Content-Type: application/json" \
  -d '{"species":"human","fasta":">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA"}'
```

Interactive OpenAPI docs are available at:

```text
http://127.0.0.1:8010/docs
```

## Legacy API Deployment Notes

The container binds to `127.0.0.1:8010` by default. Public traffic reaches it through the API proxy at:

```text
https://api.oglcnac.org/api/v1/predict
```

The live API proxy routes requests with `Host: api.oglcnac.org` to this service
during the transition. It is not part of the website runtime.
Do not bind the container directly to `0.0.0.0` on a public server unless another firewall or gateway protects it.

Recommended controls already included:

- Optional `X-API-Key` authentication through `PREDICTION_API_KEYS`; leave blank for direct browser use
- Per-client in-memory rate limiting through `PREDICTION_RATE_LIMIT_PER_MINUTE`
- FASTA payload size limit through `PREDICTION_MAX_FASTA_CHARS`
- CORS origin allowlist through `PREDICTION_CORS_ORIGINS`
- Versioned API path `/api/v1/predict`
