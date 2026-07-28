# Task 1 Report: Reproducible Shared-Site Build and QA Foundation

Status: `DONE_WITH_CONCERNS`

## RED Failure Evidence

The first observable behavior suite was added before production changes and run
with:

```bash
python3 -m unittest scripts.tests.test_site_build -v
```

The corrected final RED run exited 1 with 29 failures. Relevant expected
failures included:

- `test_build_is_dependency_free_and_deterministic`: `scripts/build_site.py`
  did not exist.
- `test_check_reports_generated_output_drift`: the build/check interface did
  not exist.
- `test_deploy_rejects_stale_generated_output_before_copying`: the deploy
  helper did not run a generated-output check.
- `test_runtime_dependency_audit_forbids_external_origins`:
  `scripts/check_site.py` did not exist.
- `test_shared_shell_has_metadata_and_semantic_landmarks`: generated pages did
  not have the shared `site-header`, primary navigation, descriptions,
  canonical URLs, and current-page/current-section state.
- `test_tracked_generated_outputs_are_current`: the drift checker did not
  exist.

Two pre-migration guards already passed in RED:

- The public HTML route set matched the 25 tracked routes.
- The whitespace-normalized SHA-256 snapshots of every content page's
  `<main>` matched the baseline.

The complete final RED output was captured locally in
`/tmp/publication-task1-red-final.log`.

During self-review, a relative-URL QA edge case was also handled test-first:

```bash
python3 -m unittest \
  scripts.tests.test_site_build.SiteBuildTests.test_runtime_dependency_audit_forbids_external_origins \
  -v
```

It exited 1 because `./static/js/feature.js` was incorrectly classified as
external. The auditor was then corrected to reject URL schemes/authorities
while accepting both root-relative and document-relative same-origin assets.

## Implementation Summary

- Added a dependency-free Python site generator at `scripts/build_site.py`.
  It runs under `python3 -S`, reads only standard-library JSON/text sources,
  produces deterministic bytes, writes 25 tracked HTML files plus
  `frontend/static/css/app.css`, and supports `--check` drift detection.
- Added shared build-time templates for the document shell, metadata,
  responsive `<details>` navigation, section navigation, footer, 404 redirect,
  and centralized legacy runtime declarations.
- Added `site/site.json` with all page routes, titles, descriptions, canonical
  paths, body/main classes, section navigation, and page-specific head assets.
- Moved every existing page's `<main>` content and post-footer scripts into
  tracked page fragments, normalizing only insignificant trailing whitespace.
  A regression test locks whitespace-normalized baseline hashes so Task 1
  cannot silently rewrite page-specific content.
- Split the existing application stylesheet into three tracked source modules
  and added a fourth shared-shell module. The generated CSS remains tracked.
- Added `scripts/check_site.py`, a strict same-origin runtime auditor. The
  fixture-level test proves external scripts/styles fail and same-origin
  absolute/relative assets pass.
- Added package commands:
  - `npm run build:site`
  - `npm run check:site`
  - `npm run test:site`
  - `npm run qa:runtime`
- Updated `scripts/deploy-frontend.sh` to resolve the active repository
  worktree and reject stale generated output before validating/copying to the
  deploy repository.
- Updated root and frontend documentation to identify `site/` as authoritative
  source and `frontend/` as tracked generated output.

## Verification Commands and Results

Focused and regression verification was rerun fresh before the implementation
commit:

```bash
npm run build:site
npm run check:site
npm run test:site
npm run test:hexnac
npm run test:prediction
git diff --check
python3 -m py_compile \
  scripts/build_site.py scripts/check_site.py scripts/tests/test_site_build.py
bash -n scripts/deploy-frontend.sh
```

Results:

- Build: generated 26 files.
- Drift check: `Generated site is current (26 files).`
- Task 1 focused suite: 9 passed, 0 failed.
- HexNAcQuest unit suite: 8 passed, 0 failed.
- HexNAcQuest Chromium suite: 5 passed, 0 failed.
- Prediction unit suite: 12 passed, 0 failed.
- Prediction Chromium suite: 5 passed, 0 failed.
- Total automated tests: 39 passed, 0 failed.
- Diff whitespace check, Python compilation, and Bash syntax check: exit 0.

The generated frontend was also served locally and exercised with:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory frontend
OGLCNAC_BASE_URL=http://127.0.0.1:8765 npm run smoke:static:browser
```

Result: `BROWSER_SUMMARY PASS`. All 24 content pages returned HTTP 200. The
smoke also verified Atlas search/browse/detail, OGT-PIN search/detail,
PRED-DL browser prediction/parity with no API calls, and HexNAcQuest browser
analysis/parity.

The intentional Task 2 gate was run with:

```bash
npm run qa:runtime
```

Result: exit 1 with 160 generated-page findings. All findings are repetitions
of the existing legacy Bootstrap, jQuery, DataTables, JSZip, and pdfmake
declarations now owned by the two shared legacy template fragments. No new
transitional vendor copies were added.

## Commit

- `b0cf494a98f97e1aa27e4a6b7b423a3e4e3fa46f` — Build reproducible shared site
  shell
- `4200c470919d178195b73c2493276bc0c9057e58` — Normalize generated site source
  whitespace

## Self-Review

- Confirmed the generator is deterministic and has no package/runtime
  dependency: the focused suite runs two independent `python3 -S` builds and
  compares every generated digest.
- Confirmed drift detection catches an independently mutated generated file
  and the deploy helper rejects it before touching a deploy repository.
- Confirmed all generated HTML/CSS outputs remain tracked.
- Confirmed the exact pre-migration public route set is preserved.
- Confirmed every page-specific `<main>` whitespace-normalized hash remains
  unchanged.
- Confirmed generated content pages have shared metadata and semantic
  landmarks, and representative desktop/static interactions pass in Chromium.
- Confirmed Atlas release CSVs, prediction reference backend, API proxy,
  browser model assets, and dataset bundles have no Task 1 diff.
- Reviewed the generated page samples and full file list; changes outside
  shell/build/QA/docs/generated output were not introduced.
- `git diff --check`, Python compilation, Bash syntax validation, focused
  tests, model regressions, and browser smoke all passed.

## Concerns

1. The strict zero-external-runtime production gate intentionally remains red
   until Task 2 replaces the legacy table/runtime stack. The declarations are
   centralized, detectable, and unchanged in functionality, but generated
   legacy pages still load them.
2. The retained blocking CDN scripts make the all-route local smoke
   noticeably slow. This is existing runtime debt and should disappear with
   the Task 2 native table/runtime migration.
3. The parent publication plan document remains an unrelated untracked file
   and was deliberately excluded from the Task 1 implementation commit.

## Review Fix Round 1

Two Important review findings were addressed independently with RED/GREEN
cycles.

### Case-Insensitive Stylesheet `rel` Tokens

The controlled fixture uses only an external stylesheet with
`rel="alternate StyleSheet"`. Before the fix:

```bash
python3 -m unittest \
  scripts.tests.test_site_build.SiteBuildTests.test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively \
  -v
```

RED output:

```text
test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively (scripts.tests.test_site_build.SiteBuildTests) ... FAIL

======================================================================
FAIL: test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively (scripts.tests.test_site_build.SiteBuildTests)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "scripts/tests/test_site_build.py", line 325, in test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively
    self.assertNotEqual(result.returncode, 0)
AssertionError: 0 == 0

----------------------------------------------------------------------
Ran 1 test in 0.043s

FAILED (failures=1)
```

The parser now case-folds every whitespace-separated `rel` token before
matching `stylesheet`. The same command then produced:

```text
test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively (scripts.tests.test_site_build.SiteBuildTests) ... ok

----------------------------------------------------------------------
Ran 1 test in 0.039s

OK
```

### Obsolete Owned Generated Outputs

The controlled output roots contain a copied generated page at
`retired/index.html` plus unmarked `manual.html`, curator CSS, and static JSON.
Before ownership/set checking:

```bash
python3 -m unittest \
  scripts.tests.test_site_build.SiteBuildTests.test_check_reports_obsolete_owned_output_and_ignores_unrelated_files \
  scripts.tests.test_site_build.SiteBuildTests.test_build_removes_only_obsolete_owned_outputs \
  scripts.tests.test_site_build.SiteBuildTests.test_deploy_rejects_obsolete_owned_output_before_copying \
  -v
```

RED output:

```text
test_check_reports_obsolete_owned_output_and_ignores_unrelated_files (scripts.tests.test_site_build.SiteBuildTests) ... FAIL
test_build_removes_only_obsolete_owned_outputs (scripts.tests.test_site_build.SiteBuildTests) ... FAIL
test_deploy_rejects_obsolete_owned_output_before_copying (scripts.tests.test_site_build.SiteBuildTests) ... FAIL

======================================================================
FAIL: test_check_reports_obsolete_owned_output_and_ignores_unrelated_files (scripts.tests.test_site_build.SiteBuildTests)
----------------------------------------------------------------------
AssertionError: 0 == 0

======================================================================
FAIL: test_build_removes_only_obsolete_owned_outputs (scripts.tests.test_site_build.SiteBuildTests)
----------------------------------------------------------------------
AssertionError: True is not false

======================================================================
FAIL: test_deploy_rejects_obsolete_owned_output_before_copying (scripts.tests.test_site_build.SiteBuildTests)
----------------------------------------------------------------------
AssertionError: 'Generated output is stale' not found in 'Deployment directory is not a git repository: .../missing-deploy\n'

----------------------------------------------------------------------
Ran 3 tests in 0.314s

FAILED (failures=3)
```

Generated HTML and CSS now carry exact type-specific ownership markers.
`--check` compares the marker-owned observed set to the manifest-derived
expected set, and a normal build removes only marker-owned obsolete outputs.
Unmarked HTML/CSS and all other public file types remain outside generator
ownership. The same focused command then produced:

```text
test_check_reports_obsolete_owned_output_and_ignores_unrelated_files (scripts.tests.test_site_build.SiteBuildTests) ... ok
test_build_removes_only_obsolete_owned_outputs (scripts.tests.test_site_build.SiteBuildTests) ... ok
test_deploy_rejects_obsolete_owned_output_before_copying (scripts.tests.test_site_build.SiteBuildTests) ... ok

----------------------------------------------------------------------
Ran 3 tests in 0.343s

OK
```

### Review-Round Focused Verification

```bash
npm run check:site
npm run test:site
git diff --check
python3 -m py_compile \
  scripts/build_site.py scripts/check_site.py scripts/tests/test_site_build.py
bash -n scripts/deploy-frontend.sh
```

Output:

```text
Generated site is current (26 files).
Ran 13 tests in 0.925s
OK
```

`git diff --check`, Python compilation, and Bash syntax validation all exited
0. The strict production runtime gate remains intentionally red for the
already-ledgered Task 2 legacy runtime migration.
