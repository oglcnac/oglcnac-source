# Task 4 Report: Unified Publication-Grade Design, Content, and Figures

Status: `DONE`

## Implementation Commit

- `73bc3cfab899000d0d31e1b92bb7c1edb4581852` — Refresh
  publication-grade site design

## RED Evidence

The accessibility, semantic, visual-art, and interaction expectations were
added before production changes.

### Page semantics and accessible presentation

```bash
python3 -m unittest scripts.tests.test_site_build -v
```

The new assertions initially failed across the generated site because pages
had missing or multiple H1 elements, skipped heading levels, unlabeled form
controls, placeholder image descriptions, obsolete `font`/`align` markup, and
tables without named keyboard-focusable scroll regions. The home page also
used historical Atlas evidence images as generic suite artwork.

A separate skip-link assertion initially failed all 25 generated HTML pages:
the shared shell did not provide a link from the start of the document to the
main content.

### Runtime behavior, responsive layout, and motion

```bash
node --test scripts/tests/site-interactions-browser.test.js
```

The new browser checks initially produced three expected failures:

- an unknown route redirected to the homepage instead of retaining a useful
  404 state;
- a card transition remained `0.16s` under reduced-motion preferences;
- Atlas Browse expanded to 485 CSS pixels at a 390-pixel viewport.

The final visual pass also caught a PRED-DL desktop regression and added a
focused test before changing the style:

```text
PRED-DL title intrudes into the art column:
{"titleRight":690,"titleScrollWidth":607,"titleClientWidth":519,"artLeft":750}
```

### Scientific scope of conceptual art

The first replacement PRED-DL diagram described only browser inference. A
focused source/output assertion was added for the publication's actual
model-development concepts and failed until the artwork included
O-GlcNAcAtlas, train/test splitting, Word2Vec, one-hot, BLOSUM62, AAindex,
CNN–BiLSTM, model selection, voting, and O-GlcNAcPRED-DL.

### Review-driven regressions

The independent review found three Important issues and one Minor build
ownership issue. Each was reproduced before its fix:

- the suite workflow did not contain a
  `data-flow="protein-to-pred-dl"` connector, because the protein-sequence
  arrow visually terminated on OGT-PIN;
- the 320-pixel reflow test failed first on Atlas Contact with
  `{"viewport":320,"document":342,"body":342}`;
- the original yellow focus outline had only 1.78:1 contrast against white;
- after deleting a copied source SVG in an isolated fixture,
  `build_site.py --check` incorrectly returned 0 and a normal rebuild retained
  the obsolete generated SVG.

The corrected workflow connector, two-tone focus treatment, 320/390-pixel
reflow behavior, and generated-asset ownership manifest all passed focused
tests before the final regression run.

## Implementation Summary

### Unified visual system

- Added a final authoritative design layer,
  `site/styles/50-publication.css`, using the homepage-derived navy and neutral
  palette with section accents:
  - Atlas blue;
  - OGT-PIN teal;
  - PRED-DL blue;
  - HexNAcQuest purple.
- Standardized page heroes, section spacing, cards, citations, forms,
  buttons, result surfaces, tables, calls to action, navigation, and footer
  presentation.
- Rebuilt the homepage as a suite-level entry point with an integrated hero,
  four clearly differentiated resource cards, scientific context, workflow,
  and direct action paths.
- Restyled every Atlas, OGT-PIN, PRED-DL, and HexNAcQuest public page without
  changing routes, scientific datasets, prediction models, or result schemas.
- Kept current Atlas 5.0 metrics separate from fixed historical publication
  evidence.

### Deterministic conceptual artwork

Added eight source-controlled SVGs under `site/assets/img/`, copied
deterministically to `frontend/static/img/`:

- `suite-hero.svg`
- `suite-workflow.svg`
- `tool-atlas.svg`
- `tool-ogt-pin.svg`
- `tool-pred-dl.svg`
- `tool-hexnac-quest.svg`
- `ogt-pin-overview.svg`
- `pred-dl-workflow.svg`

The integrated workflow maps experimental evidence to Atlas and OGT-PIN,
protein sequence to PRED-DL, and diagnostic MS/MS intensities to HexNAcQuest.
The PRED-DL workflow preserves the publication's model-development concept,
including train/test splits, four feature representations, CNN–BiLSTM
models, model selection, and ensemble voting.

The homepage no longer presents `header.png`, `figure1.png`, or `figure2.png`
as generic conceptual art. Historical/evidence figures remain on their
scientifically appropriate statistics pages.

### Semantics and accessibility

- Enforced exactly one H1 and ordered heading levels on every generated
  content page.
- Added programmatic names to form controls.
- Added meaningful image alternatives and figure captions.
- Added a shared skip link and a stable `main-content` target.
- Added visible two-tone keyboard focus indicators. The dark outline has
  9.13:1 contrast against white and the white halo has 17.96:1 contrast
  against the navy header.
- Added reduced-motion behavior that removes animation and transition
  durations.
- Wrapped all data tables in named, keyboard-focusable responsive regions.
- Added polite live announcements for dynamic status, loading, empty, ready,
  and error states.
- Added wrapping behavior for long scientific names, email actions, and DOI
  links at narrow viewports.
- Verified every public content route has no document-level horizontal
  overflow at both 390 and 320 CSS pixels.

### Content and behavior

- Copyedited presentation text while retaining the existing scientific
  claims and citations.
- Preserved all search fields, query strings, browse species, detail
  identifiers, table columns, downloads, model behavior, confidence mapping,
  and HexNAcQuest classification behavior.
- Kept Atlas 5.0 downloads and made the archived 4.0 files explicit.
- Replaced the home redirect on unknown paths with a useful no-index 404 page
  that retains the requested URL and offers direct resource links.
- Preserved legacy Atlas and OGT-PIN path-style detail URLs by redirecting
  them to their established query-string routes.
- Added an asset ownership manifest so a deleted or renamed authoritative SVG
  is detected as generated-output drift and removed by the next build without
  deleting unrelated public assets.

During implementation, a capitalization-only table copyedit changed an Atlas
CSV header contract. The browser export regression caught it, and every
original header was restored before final verification.

## Protected Evidence Figures

The publication evidence files were not regenerated or edited. Final SHA-256
values match the locked pre-task values:

```text
a17d21d28fc7f02091aa27ee642c00eb355797439406bbf5037635c799629a2b  frontend/static/img/figure1.png
5b710de762c39eeca761f3e7c7d1ea31b567b2d7fbf1fe01a1d0cd101bbe471d  frontend/static/img/figure2.png
eb1c9aa6ffe6199624b39e5e92582a9248f194c01d11d70602d0aaf789b7f3a8  frontend/static/img/table1.png
77df672b016e3d923b3640b2526a0576c8a5b4a9b0040d285a59cc6493984f6d  frontend/static/img/interactome-figure1.svg
6602ab1e8f2cf906a23a7447806e9efe5565d1ed4eef97e82d0522f8736f0708  frontend/static/img/OGT-Interactome-760.svg
```

## Final Automated Verification

All commands were rerun against the final generated state before the
implementation commit.

```bash
npm run test:site
npm run test:data
npm run test:tables
npm run test:prediction
npm run test:hexnac
npm run qa:runtime
npm run check:site
npm run smoke:static
git diff --check
```

Results:

- site generator, semantics, accessibility, and asset ownership: 20/20 passed;
- data generator and browser data API: 14/14 passed;
- native table unit and Chromium interaction tests: 23/23 passed;
- PRED-DL unit and Chromium model parity: 17/17 passed;
- HexNAcQuest unit and Chromium parity: 13/13 passed;
- total automated assertions in the package suites above: 87 passed;
- external-runtime audit: passed;
- generated-output check: all 35 generated files current;
- static route/asset smoke: `PASS`;
- diff whitespace check: passed.

The final frontend was also served locally and exercised with:

```bash
OGLCNAC_BASE_URL=http://127.0.0.1:8771 npm run smoke:static:browser
```

Result: `BROWSER_SUMMARY PASS`. All 22 routes in the live smoke returned HTTP
200. The smoke also exercised Atlas search/browse/detail, OGT-PIN
search/detail, PRED-DL browser inference, and HexNAcQuest analysis without
external application APIs.

## Visual Self-Review

Every content page was reviewed in Chromium at 1440×1100 and 390×844:

- homepage;
- Atlas home, statistics, search, browse, detail, tutorial, download, and
  contact;
- OGT-PIN home, statistics, search, detail, tutorial, and contact;
- PRED-DL home, prediction input, tutorial, download, and contact;
- HexNAcQuest home, analysis, tutorial, and contact;
- useful 404.

Dynamic review states included Atlas and OGT-PIN populated search results,
empty/error search states, known/missing detail records, Atlas browse
results, PRED-DL result and validation-error states, and HexNAcQuest result
and validation-error states.

The post-review narrow-layout correction was additionally inspected at
320×844 on the homepage, Atlas Contact, PRED-DL home, and HexNAcQuest home.
The corrected PRED-DL desktop hero and publication workflow were inspected
again after regeneration.

Temporary review captures were written only under `/tmp`; they are not
release artifacts. Task 6 remains responsible for the final reproducible
release visual package.

The visual review found and resolved:

- a clipped mobile homepage title;
- awkward narrow-screen scientific-name wrapping;
- the desktop PRED-DL title extending beyond its text column;
- the PRED-DL diagram's missing publication model-development stages;
- the suite workflow protein arrow targeting the wrong resource;
- contact/DOI/HexNAcQuest overflow at 320 pixels.

## Independent Review

The first independent review requested changes for the workflow connector,
320-pixel reflow, and focus-indicator contrast, and noted the generated-SVG
ownership gap.

After the fixes, the same reviewer reran focused checks and reported:

- 20/20 site-build tests passed;
- 14/14 browser interaction tests passed;
- all 35 generated files current;
- `git diff --check` passed;
- no remaining Critical or Important findings;
- no new breakage;
- final verdict: `APPROVE`.

## Concerns and Handoff

No Task 4 blocker remains. Older unreferenced raster and vendor files were
intentionally not deleted; Task 5 owns the full orphan-asset audit. Task 6
owns release-wide visual snapshots, responsive evidence, and final
publication packaging.
