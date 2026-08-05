# Static HexNAcQuest

HexNAcQuest is served from `/hexnac-quest/` as a fully static browser
application. It does not require R, Shiny, WebR, a container, or an HTTP API.
The selected CSV remains on the visitor's device.

## Source layout

```text
site/pages/hexnac-quest/                    Authored public pages
public/static/js/hexnac-quest-core.js       Model and CSV contract
public/static/js/hexnac-quest-worker.js     Background parsing/prediction
public/static/js/hexnac-quest-ui.js         Browser UI
public/static/hexnac-quest/v1/model.json    Versioned model manifest
public/static/hexnac-quest/vendor/           Pinned parser runtime/license
public/static/hexnac-quest/tutorial/         Migrated tutorial images
scripts/tests/hexnac-quest-*.test.js         Unit and browser parity tests
```

The original 250 MB `model1.rda` and Shiny application are intentionally not
part of the deployment. The manifest records the legacy RDS checksum and the
exact fitted coefficients needed for inference. The committed golden fixture
was derived from that R object and guards all 10,000 canonical example rows.

## Prediction contract

The required CSV columns are:

```text
id,f126,f138,f144,f168,f186
```

The five intensity values form the normalization denominator. The logistic
model uses normalized f126, f138, and f144 values. A linear predictor greater
than zero is labeled `GlcNAc`; all other valid values are labeled `GalNAc`.
Invalid rows are skipped with a row-specific reason. The exported columns are:

```text
pred_outcome,id,f126,f138,f144,f168,f186
```

The public limits are 25 MB and 250,000 data rows.

## Verification

```bash
npm ci
npm run test:hexnac
```

The unit suite verifies input and output behavior plus exact parity against the
legacy R classifications. The browser suite exercises upload, preview, chart,
prediction, summary, cancellation, and download. GitHub Actions repeats the
browser suite in Chromium, Firefox, and WebKit.

If the model is ever replaced, use a new versioned manifest directory. Record
the source-model checksum, generate an independent reference fixture, and make
all unit and browser parity checks pass before deployment.

## Legacy application status

The former shinyapps.io applications are not a dependency, backup, or
deployment target. Their scientific contract is preserved by the model
checksum, coefficients, canonical fixture, and exact parity tests in this
repository. Do not recreate an R/Shiny runtime for routine website operation.
