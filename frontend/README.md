# O-GlcNAc Static Public Site

Static frontend generated from the Django public pages. This repository is prepared for GitHub Pages at `oglcnac.org`.

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

Regenerate static data bundles from the source SQLite database:

```bash
python3 scripts/generate_static_data.py
```
