# O-GlcNAc Static Frontend

This directory is the editable source for the public static website at `https://oglcnac.org/`.
It is deployed by copying this directory to `/home/bach/oglcnac-static-site` and pushing that deploy checkout to GitHub Pages.

Dynamic behavior is browser-side:

- Atlas/OGT-PIN search, browse, and detail pages use static JSON bundles in `/static/data/`.
- Atlas Browse uses client-side pagination over the static bundle.
- PRED-DL loads versioned TensorFlow.js models from `/static/prediction/` and
  performs inference in a Web Worker using the WASM backend.
- HexNAcQuest parses CSV and applies its versioned logistic model in a dedicated
  Web Worker from self-hosted static assets under `/static/hexnac-quest/`.
- Submitted protein sequences remain in the browser; there is no automatic API
  fallback.
- Contact pages use mailto links.

## GitHub Pages

This repository is prepared for GitHub Pages:

- `CNAME` points the site to `oglcnac.org`.
- `.nojekyll` disables Jekyll processing.
- `404.html` redirects legacy detail paths like `/atlas/detail/P18583` to query-style pages that work on GitHub Pages.

## Static Data

The generated JSON bundles live in `static/data/` and are tracked in git.
Regenerate them from the curator CSV bundle.
See `../docs/DATA-UPDATES.md`.

## Static PRED-DL Assets

The browser runtime is self-hosted in `static/prediction/vendor/`. Exported
models, AAindex features, word2vec vectors, checksums, and their manifest live
in `static/prediction/v1/`. Regenerate these assets with:

```bash
python3 -m venv .venv
.venv/bin/pip install -r prediction-service/browser-export-requirements.txt
.venv/bin/python prediction-service/tools/export_browser_predictor.py
npm run test:prediction
```

The browser output must exactly match the Python golden corpus before a new
bundle is deployed.

## Static HexNAcQuest

HexNAcQuest pages live in `hexnac-quest/`. Its model manifest, canonical
example, tutorial images, and pinned Papa Parse runtime live in
`static/hexnac-quest/`. Run `npm run test:hexnac` after any related change.
See `../docs/HEXNAC-QUEST.md` for its data and model contract.
