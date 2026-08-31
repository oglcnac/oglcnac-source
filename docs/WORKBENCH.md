# O-GlcNAc Workbench

`/analysis/` is a fully static, browser-local workflow. It accepts pasted or uploaded human/mouse FASTA, recognizes canonical UniProt accessions in common headers, runs the tracked O-GlcNAcPRED-DL 1.0 model, and joins results to the tracked Atlas and OGT-PIN JSON.

Atlas evidence is matched by exact accession and protein position. OGT-PIN evidence is protein-level and matched by accession. Missing evidence means “not reported” in these tracked releases; it is not proof of absence. FASTA identifiers without a recognized UniProt accession still receive predictions but cannot be evidence-matched.

The versioned export contract is defined by `public/static/js/workbench-core.js`. CSV and JSON include protein identifier, species, sequence length, site, sequence window, probability, confidence band, model version, Atlas status/count/PMIDs, and OGT-PIN status/count. The interface intentionally calculates no composite score.

Run:

```bash
npm run test:workbench:unit
npm run test:workbench:browser
```

Do not label Workbench output as PRED-DL 2.0 until `python3 prediction-v2/tools/check_release.py` passes after the prospective 2027-01-31 corpus freeze.
