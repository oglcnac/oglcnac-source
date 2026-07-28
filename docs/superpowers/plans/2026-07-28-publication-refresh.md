# Publication-Grade Oglcnac Suite Refresh

## Context

Refresh every public page and interactive state as one coherent, reproducible,
fully static research-tool suite. Preserve public routes, canonical scientific
datasets, prediction/model behavior, citations, old Atlas release downloads,
and evidence-bearing publication figures.

## Global Constraints

- Keep all current public routes and query parameters compatible.
- The deployed frontend must use no third-party runtime scripts or styles.
- Atlas and OGT-PIN use tracked static data; PRED-DL and HexNAcQuest continue
  to execute entirely in browser workers without the legacy prediction API or
  Shiny.
- Result tables offer full-filtered CSV and copy-visible-rows only; remove
  Excel/PDF generation.
- The canonical Atlas 5.0 bundle contains 61,035 entries: 46,517 dataset-I
  unambiguous entries and 14,518 dataset-II ambiguous entries.
- Use a tracked Atlas sequence snapshot first and UniProt only as a
  non-blocking fallback. Atlas evidence must render if UniProt is unavailable.
- Preserve data plots and interaction-network figures. Redraw only conceptual
  or decorative graphics as deterministic SVG.
- Retain Atlas 4.0 CSVs and the prediction reference backend/API proxy through
  the documented 2026-08-11 transition.
- Generated public HTML and CSS remain tracked. The build must be
  dependency-free, deterministic, and provide a drift check.
- Use strict test-first development for production behavior.
- Do not deploy production until the user approves desktop/mobile visual
  contact sheets.

## Task 1: Reproducible shared-site build and QA foundation

Add failing tests for shared page-shell behavior, semantic structure, internal
assets, dependency isolation, and generated-output drift. Implement a
dependency-free build-time template system with shared metadata, responsive
navigation, footer, page metadata, and modular CSS sources. Generate tracked
public HTML/CSS, add build and check commands, and make the deploy script reject
stale generated output. Preserve page-specific content and routes at this
stage.

## Task 2: Native scalable result tables and complete data interactions

Add failing unit/browser tests for paginating and filtering without rendering
tens of thousands of DOM rows, sorting, copy-visible-rows, full-filtered CSV,
large Atlas searches, empty/error states, every Atlas/OGT-PIN search field,
every Atlas browse species, known/missing detail records, and mobile
navigation. Implement one dependency-free native table component and migrate
Atlas search/browse/detail, OGT-PIN search/detail, and PRED-DL result tables.
Remove Bootstrap, jQuery, DataTables, JSZip, and pdfmake runtime usage.

## Task 3: Canonical release metadata and self-contained Atlas sequences

Add failing generator and browser tests for exact release counts, documented
unique-count rules, sequence snapshot lookup, missing local sequences, UniProt
fallback, and complete Atlas evidence when the fallback fails. Extend the
curator workflow to generate tracked release metadata and a versioned Atlas
accession-to-sequence snapshot from reproducible local inputs. Display
data-derived Atlas 5.0 metrics and clearly label historical publication
statistics.

## Task 4: Unified publication-grade design, content, and figures

Refresh all public pages and 404 behavior using the homepage-derived
navy/neutral system with Atlas blue, OGT-PIN teal, PRED-DL blue, and
HexNAcQuest purple accents. Add one H1 per content page, ordered headings,
programmatic labels, meaningful alt text, keyboard focus, accessible status
messages, responsive table regions, and consistent loading/empty/error
states. Copyedit presentation text without changing scientific claims.
Create deterministic SVG artwork for the integrated suite workflow, tool-card
art, OGT-PIN overview, and PRED-DL workflow; keep evidence figures unchanged.

## Task 5: Cleanup, CI, maintenance, and deployment hardening

Add failing repository/CI checks for orphaned public assets, forbidden runtime
origins, stale generated output, and incomplete route coverage. Remove only
confirmed-unused raster/vendor/code files, clean caches, expand Chromium,
Firefox, and WebKit QA, and update rebuild, data-update, maintenance, and
deployment documentation. Harden browser smoke handling so navigation-aborted
requests are not mistaken for broken assets while real failures remain fatal.

## Task 6: Full release audit and visual approval package

Run every static, unit, browser, accessibility, offline, link, download, and
large-result scenario. Capture every normal/result/detail/empty/error/analysis
state at 1440x1100 and 390x844, create before/after contact sheets and a
machine-readable report, and inspect all images. Fix any discovered regression
test-first. Stop before production deployment and present the visual package
to the user for approval.

## Final Rollout

After visual approval, run fresh verification, commit/push the source branch,
integrate it into the source default branch, deploy the exact generated
frontend to the GitHub Pages repository, repeat production smoke/interaction
checks, and leave all local repositories clean and synchronized. External
Shiny deletion, DNS removal, and legacy backend retirement are separate
destructive operations.
