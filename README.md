# O-GlcNAc Source

This repository is the single authoritative source for the complete public
website at [oglcnac.org](https://oglcnac.org/). A clean clone contains every
page, dataset, browser runtime, model, image, and build/deployment script needed
to rebuild the site. Production has no application server or database.

Atlas, OGT-PIN, PRED-DL, and HexNAcQuest run entirely in the browser. PRED-DL
uses the bundled TensorFlow.js/WASM runtime and models; HexNAcQuest uses its
bundled JavaScript model. User sequences and CSV files are not uploaded.

## Repository layout

```text
site/                    Authored templates, page content, metadata, and CSS
public/                  Tracked datasets and other public static assets
prediction-reference/   Offline Python reference/export code for PRED-DL
scripts/                 Build, test, deployment, and data-generation tools
docs/                    Maintenance and recovery documentation
dist/                    Generated complete site (ignored; never authoritative)
```

The `oglcnac/oglcnac` GitHub repository is a generated GitHub Pages artifact.
It is populated from a temporary clone during deployment; it is not edited and
does not need a permanent server checkout. The separate
[`YaoxiangLi/oglcnac`](https://github.com/YaoxiangLi/oglcnac) R package is an
optional curator tool, not a website deployment dependency.

## Build and verify

```bash
npm ci
npm run build:site
npm run qa:repository
npm run test:site
```

`npm run build:site` combines `site/` and `public/` into a reproducible `dist/`
tree. The builder rejects source collisions, symlinks, unowned output, and
unexpected output drift.

For the complete gates, run:

```bash
npm run qa:pr
npm run test:tables:browser
npm run test:prediction:browser
npm run test:hexnac:browser
```

## Deploy

Commit and push the reviewed source first, then run:

```bash
./scripts/deploy-frontend.sh
```

The helper verifies the source commit, builds and audits a temporary artifact,
clones `github.com/oglcnac/oglcnac` into a temporary directory, publishes the
artifact, records the source SHA in the deploy commit, and removes the clone.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
[docs/REBUILD.md](docs/REBUILD.md).

## Operational guides

- [Frontend ownership](docs/FRONTEND.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Clean-room rebuild](docs/REBUILD.md)
- [Maintenance checklist](docs/MAINTENANCE.md)
- [Curator workflow](docs/CURATOR-WORKFLOW.md)
- [Data updates](docs/DATA-UPDATES.md)
- [Static PRED-DL](docs/STATIC-PREDICTION.md)
- [Static HexNAcQuest](docs/HEXNAC-QUEST.md)

Never commit secrets, `.env` files, caches, virtual environments, screenshots,
or a generated `dist/` directory.
