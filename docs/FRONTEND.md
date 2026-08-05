# Static website ownership

The complete public website is generated into ignored `dist/`; there is no
tracked generated frontend directory.

## Edit boundaries

- Edit page content, navigation, templates, and CSS in `site/`.
- Edit/copy public datasets, images, browser JavaScript, model assets, examples,
  and pinned vendor files in `public/`.
- Use `prediction-reference/` only to verify or export the PRED-DL browser model.
- Never edit `dist/` or the generated Pages repository.

Build and audit the result with:

```bash
npm run build:site
npm run check:site
npm run qa:repository
npm run test:site
```

The build rejects collisions between authored output and public assets,
symlinks, unexpected existing output, and changed output not owned by its
manifest. The manifest covers every file in the resulting site.

## Browser-only behavior

- Atlas and OGT-PIN use `/static/data/` JSON bundles.
- PRED-DL loads self-hosted TensorFlow.js/WASM and versioned assets from
  `/static/prediction/`, then runs inference in a Web Worker.
- HexNAcQuest loads its model, parser, examples, and tutorial assets from
  `/static/hexnac-quest/`, then runs scoring in a Web Worker.
- User inputs remain in the browser; there is no API fallback.
- Contact links use the user's email client.

The build supplies `CNAME`, `.nojekyll`, and the static `404.html` compatibility
redirect. GitHub Pages can therefore host the generated `dist/` tree directly.

See `DATA-UPDATES.md`, `STATIC-PREDICTION.md`, and `HEXNAC-QUEST.md` for each
asset contract.
