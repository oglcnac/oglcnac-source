# Data Updates

Atlas and OGT-PIN run from JSON bundles in `frontend/static/data/`.
Update those files only when the source SQLite database changes.

## Regenerate

From the source repo:

```bash
python3 frontend/scripts/generate_static_data.py --database /path/to/db.sqlite3
```

The script writes:

```text
frontend/static/data/atlas-records.json
frontend/static/data/atlas-records.json.gz
frontend/static/data/ogt-pin-records.json
frontend/static/data/ogt-pin-records.json.gz
```

## Verify

```bash
git diff --stat frontend/static/data
npm run smoke:static
npm run smoke:static:browser
```

Commit the source repo first, then deploy the frontend:

```bash
./scripts/deploy-frontend.sh
```

## Notes

- Do not use archived legacy folders for normal updates.
- Do not commit source databases unless that is an explicit project decision.
- Keep generated JSON row counts visible in the command output for review.
