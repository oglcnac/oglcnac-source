# O-GlcNAc Static Frontend

This directory is the editable source for the public static website at `https://oglcnac.org/`.
It is deployed by copying this directory to `/home/bach/oglcnac-static-site` and pushing that deploy checkout to GitHub Pages.

Dynamic behavior is browser-side:

- Atlas/OGT-PIN search, browse, and detail pages use static JSON bundles in `/static/data/`.
- Atlas Browse uses client-side pagination over the static bundle.
- PRED-DL prediction calls `https://api.oglcnac.org/api/v1/predict`.
- Contact pages use mailto links.

## GitHub Pages

This repository is prepared for GitHub Pages:

- `CNAME` points the site to `oglcnac.org`.
- `.nojekyll` disables Jekyll processing.
- `404.html` redirects legacy detail paths like `/atlas/detail/P18583` to query-style pages that work on GitHub Pages.

## Static Data

The generated JSON bundles live in `static/data/` and are tracked in git.
Regenerate them only when the source SQLite database changes:

```bash
python3 scripts/generate_static_data.py --database /path/to/db.sqlite3
```

The script writes to `frontend/static/data/` by default.
