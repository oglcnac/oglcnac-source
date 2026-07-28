# Data Updates

Atlas and OGT-PIN run from JSON bundles in `frontend/static/data/`.
Use curated CSV files for normal updates. SQLite is supported only for legacy recovery.
For the complete curator workflow, see `docs/CURATOR-WORKFLOW.md`.

## Regenerate From CSV

From the source repo:

```bash
python3 frontend/scripts/generate_static_data.py \
  --atlas-unambiguous-csv /path/to/atlas-records-unambiguous.csv \
  --atlas-ambiguous-csv /path/to/atlas-records-ambiguous.csv \
  --ogt-pin-csv /path/to/ogt-pin-records.csv
```

The script writes:

```text
frontend/static/data/atlas-records.json
frontend/static/data/atlas-records.json.gz
frontend/static/data/atlas-release-v1.json
frontend/static/data/atlas-release-v1.json.gz
frontend/static/data/ogt-pin-records.json
frontend/static/data/ogt-pin-records.json.gz
```

Keep Atlas dataset labels separate:

- unambiguous sites are dataset-I and are exported with `ambiguous=unambiguous`
- ambiguous sites are dataset-II and are exported with `ambiguous=ambiguous`

The CSV generator also accepts `--atlas-csv` for a combined Atlas file, but that file must already include a correct `ambiguous` column.

The versioned browser sequence bundle is
`frontend/static/data/atlas-sequences-v1.json`. It is generated from controlled
local FASTA files with `--atlas-sequence-fasta`, or updated in bounded,
cached query batches with `--fetch-uniprot-sequences`. See
`docs/CURATOR-WORKFLOW.md` for the exact count rules, identifier exclusions,
coverage, provenance, and update commands. Routine builds and tests consume
tracked JSON and do not contact UniProt. Normal CSV regeneration reconciles
the tracked snapshot to the current eligible/excluded accession sets, removing
obsolete sequences and marking newly eligible accessions missing until a
controlled FASTA or batch update supplies them.

## Legacy SQLite Regeneration

```bash
python3 frontend/scripts/generate_static_data.py --database /path/to/db.sqlite3
```

## Verify

```bash
git diff --stat frontend/static/data
python3 -m unittest scripts.tests.test_generate_static_data -v
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
