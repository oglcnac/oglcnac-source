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
frontend/static/data/atlas-release-v1.json
frontend/static/data/atlas-release-v1.json.gz
frontend/static/data/ogt-pin-records.json
frontend/static/data/ogt-pin-records.json.gz
```

Expected current row counts:

```text
atlas_records=61035
ogt_pin_records=3757
atlas_unique_proteins=8880
atlas_unique_sites=33047
```

Release metadata is calculated from the two canonical CSV inputs:

- total records are all CSV rows: 61,035;
- dataset-I/unambiguous records are the 46,517 rows in the unambiguous CSV;
- dataset-II/ambiguous records are the 14,518 rows in the ambiguous CSV;
- unique proteins are 8,880 distinct trimmed, nonblank accession values;
- unique sites are 33,047 distinct complete
  `(accession, position_in_protein, site_residue)` tuples.

Rows with blank or incomplete identifiers remain part of the release record
count. They are not silently repaired and incomplete tuples do not contribute
to the unique-site count. The current release has four blank-accession records,
7,550 syntactically valid identifiers explicitly sourced as UniProt, 1,327
non-UniProt identifiers, and three unresolved identifiers.

## Update The Atlas Sequence Snapshot

The browser reads the tracked `atlas-sequences-v1.json` bundle first. Ordinary
site builds, tests, and the normal CSV command above do not require network
access. If the output directory already contains the snapshot, normal
regeneration reconciles it against the current CSV categories before
publishing: sequences for accessions that are no longer eligible are removed,
new eligible accessions are listed as missing, and all coverage and exclusion
lists are recalculated. This prevents an older snapshot from contributing stale
eligibility metadata to a newer release.

For a controlled local FASTA input:

```bash
python3 frontend/scripts/generate_static_data.py \
  --atlas-unambiguous-csv "frontend/static/dataset/Atlas 5.0_unambiguous sites_20251208.csv" \
  --atlas-ambiguous-csv "frontend/static/dataset/Atlas 5.0_ambiguous sites_20251208.csv" \
  --ogt-pin-csv frontend/static/dataset/ogt-pin-records.csv \
  --atlas-sequence-fasta /path/to/uniprot-batch.fasta \
  --sequence-retrieved-date YYYY-MM-DD \
  --sequence-source-release UNIPROT_RELEASE
```

To query the official UniProt REST service for missing eligible accessions:

```bash
python3 frontend/scripts/generate_static_data.py \
  --atlas-unambiguous-csv "frontend/static/dataset/Atlas 5.0_unambiguous sites_20251208.csv" \
  --atlas-ambiguous-csv "frontend/static/dataset/Atlas 5.0_ambiguous sites_20251208.csv" \
  --ogt-pin-csv frontend/static/dataset/ogt-pin-records.csv \
  --fetch-uniprot-sequences \
  --uniprot-cache-dir /path/to/persistent/uniprot-cache
```

The update uses bounded query batches (1–100 accessions, default 100), bounded
retries (1–5, default three) with backoff, a delay between uncached batches,
and response caching. Do not replace it with unbounded per-accession requests.
FASTA accessions must exactly match an eligible Atlas accession; the generator
never maps ambiguous, blank, non-UniProt, canonical/isoform, or unresolved
identifiers by inference. A single provenance dimension is claimed only when
every cached or fresh batch reports that dimension with the same value.
Mixed values or a mixture of labeled and headerless batches stop generation
instead of being mislabeled as one release.

The snapshot retrieved on July 28, 2026 uses UniProt release `2026_02`
(released June 10, 2026). It resolves 7,239 of 7,550 eligible accessions
(95.88%). Its metadata lists all 311 missing accessions and all excluded
non-UniProt, unresolved, and blank identifiers explicitly.

## Verify And Deploy

```bash
git diff --stat
python3 -m unittest scripts.tests.test_generate_static_data -v
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
