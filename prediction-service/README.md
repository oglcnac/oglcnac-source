# O-GlcNAcPRED-DL Prediction Service

Standalone FastAPI service for O-GlcNAcPRED-DL prediction. This project is decoupled from the main Django site and contains its own model weights, AAindex files, word2vec models, model architecture code, Dockerfile, and dependencies.

## Run Locally

```bash
cd /home/bach/oglcnac-prediction-service
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

## Public Deployment Notes

The container binds to `127.0.0.1:8010` by default. For the GitHub Pages frontend, expose it through Cloudflare at:

```text
https://api.oglcnac.org/api/v1/predict
```

The live API proxy routes requests with `Host: api.oglcnac.org` to this service. Do not bind the container directly to `0.0.0.0` on a public server unless another firewall or gateway protects it.

Recommended controls already included:

- Optional `X-API-Key` authentication through `PREDICTION_API_KEYS`; leave blank for direct browser use
- Per-client in-memory rate limiting through `PREDICTION_RATE_LIMIT_PER_MINUTE`
- FASTA payload size limit through `PREDICTION_MAX_FASTA_CHARS`
- CORS origin allowlist through `PREDICTION_CORS_ORIGINS`
- Versioned API path `/api/v1/predict`
