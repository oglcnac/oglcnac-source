# Static HexNAcQuest

HexNAcQuest is served from `/hexnac-quest/` as a fully static browser
application. It does not require R, Shiny, WebR, a container, or an HTTP API.
The selected CSV remains on the visitor's device.

## Source layout

```text
frontend/hexnac-quest/                     Public pages
frontend/static/js/hexnac-quest-core.js    Model and CSV contract
frontend/static/js/hexnac-quest-worker.js  Background parsing/prediction
frontend/static/js/hexnac-quest-ui.js      Browser UI
frontend/static/hexnac-quest/v1/model.json Versioned model manifest
frontend/static/hexnac-quest/vendor/        Pinned Papa Parse runtime/license
frontend/static/hexnac-quest/tutorial/      Migrated tutorial images
scripts/tests/hexnac-quest-*.test.js        Unit and browser parity tests
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

## Legacy application retirement

The old shinyapps.io applications were named `o-glcnac-quest` and
`HexNAcQuest` under account `oglcnac`. They may be archived only after the
static production workflow passes. Use the recoverable rsconnect operation:

```r
rsconnect::terminateApp("o-glcnac-quest", account = "oglcnac", server = "shinyapps.io")
rsconnect::terminateApp("HexNAcQuest", account = "oglcnac", server = "shinyapps.io")
```

Do not permanently delete them as part of routine website deployment.
