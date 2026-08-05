# O-GlcNAcPRED-DL Reference Model

This directory contains the scientific Python reference implementation used to
export and verify the static browser predictor. It is not a server and exposes
no HTTP API.

The public website runs the ensemble locally in each visitor's browser from
versioned TensorFlow.js/WASM assets under `public/static/prediction/`.

## Export browser assets

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r prediction-reference/browser-export-requirements.txt
.venv/bin/python prediction-reference/tools/export_browser_predictor.py
.venv/bin/python -m unittest scripts.tests.test_browser_export -v
npm run test:prediction
```

The exporter writes the versioned model manifest, all ten converted ensemble
models, AAindex values, word2vec vectors, and SHA-256 checksums to
`public/static/prediction/v1/`. Do not commit a regenerated bundle unless the
complete browser golden corpus passes exactly.

`reference_predictor.py` contains the pure Python oracle used to generate and
verify parity fixtures. Runtime API, Docker, authentication, and proxy concerns
are intentionally absent.
