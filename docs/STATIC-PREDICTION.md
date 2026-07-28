# Static O-GlcNAcPRED-DL

## Architecture

The prediction page is fully static. FASTA parsing, validation, feature
generation, model inference, ensemble weighting, confidence labels, and result
formatting all execute locally in a Web Worker.

```text
FASTA in browser
  -> validation and 29-residue candidate windows
  -> AAindex and word2vec feature encoding
  -> five species-specific TensorFlow.js models on WASM
  -> weighted ensemble and three-decimal result table
```

The human and mouse model bundles load on demand. Inference is batched to bound
memory, reports progress, and can be cancelled. The existing 200,000-character
FASTA limit is preserved. Inputs with more than 2,000 candidate S/T sites
require confirmation.

There is deliberately no automatic network/API fallback: a local inference
failure is shown to the user, preserving the privacy guarantee that submitted
sequences are not uploaded.

## Compatibility Contract

`scripts/tests/fixtures/prediction-golden.json` is generated from the current
Python reference service. The browser test covers individual and multi-protein
human and mouse FASTA files and requires exact equality for every displayed ID,
position, residue, three-decimal score, confidence label, and row order.

TensorFlow.js 2.8.5 and its WASM binaries are self-hosted. The versioned export
manifest records source and generated-asset SHA-256 checksums.

## Transition

The browser predictor was deployed on 2026-07-28. The legacy API remains
available through 2026-08-11 for observation, but the website never contacts
it. After 14 clean days, API retirement can be performed as a separate
explicitly approved infrastructure change.
