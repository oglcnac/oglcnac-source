# Curator Workflow

Use CSV files as the normal source of truth for public data updates. SQLite is
kept only for legacy recovery.

## Source Files

Keep public release CSV files in `frontend/static/dataset/`:

```text
Atlas 5.0_unambiguous sites_20251208.csv   Atlas dataset-I
Atlas 5.0_ambiguous sites_20251208.csv     Atlas dataset-II
ogt-pin-records.csv                        OGT-PIN records
```

Do not mix the two Atlas datasets:

- unambiguous sites are dataset-I and become `ambiguous=unambiguous`
- ambiguous sites are dataset-II and become `ambiguous=ambiguous`

Private working spreadsheets should stay outside git until they are ready for
public release.

## Validate With The R Package

The R package lives in `/home/bach/oglcnac-r`.

GUI workflow:

```r
oglcnac::launch_app()
```

In the app:

1. Upload the Atlas CSV or Excel file.
2. Select the correct Atlas dataset.
3. Run validation.
4. Optionally run cached UniProt enrichment.
5. Download the processed CSV.

Command-line validation:

```r
library(oglcnac)

unambiguous <- read.csv("Atlas 5.0_unambiguous sites_20251208.csv", fileEncoding = "latin1")
ambiguous <- read.csv("Atlas 5.0_ambiguous sites_20251208.csv")

validate_atlas_data(unambiguous, dataset = "unambiguous")
validate_atlas_data(ambiguous, dataset = "ambiguous")
```

Warnings are acceptable when they describe known curator fields, such as blank
accessions or text/list values in publication and position columns. Errors
should be fixed before publishing.

## Generate Static Website Data

From `/home/bach/oglcnac-source`:

```bash
python3 frontend/scripts/generate_static_data.py \
  --atlas-unambiguous-csv "frontend/static/dataset/Atlas 5.0_unambiguous sites_20251208.csv" \
  --atlas-ambiguous-csv "frontend/static/dataset/Atlas 5.0_ambiguous sites_20251208.csv" \
  --ogt-pin-csv frontend/static/dataset/ogt-pin-records.csv
```

This writes:

```text
frontend/static/data/atlas-records.json
frontend/static/data/atlas-records.json.gz
frontend/static/data/ogt-pin-records.json
frontend/static/data/ogt-pin-records.json.gz
```

Expected current row counts:

```text
atlas_records=61035
ogt_pin_records=3757
```

## Verify And Deploy

```bash
git diff --stat
npm run smoke:static
npm run smoke:static:browser
git add frontend/static/dataset frontend/static/data docs
git commit -m "Update public data bundles"
git push
./scripts/deploy-frontend.sh
```

After deployment:

```bash
curl -L -s https://oglcnac.org/ -o /tmp/oglcnac-home.html -w '%{http_code}\n'
curl -L -s https://api.oglcnac.org/health -o /tmp/oglcnac-api.json -w '%{http_code}\n'
npm run smoke:static
```
