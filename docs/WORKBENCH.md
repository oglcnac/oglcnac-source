# O-GlcNAc Workbench

`/analysis/` is a fully static, browser-local workflow. It accepts pasted or uploaded human/mouse FASTA, recognizes canonical UniProt accessions in common headers, runs the tracked O-GlcNAcPRED-DL 1.0 model, and joins results to the tracked Atlas and OGT-PIN JSON.

Atlas evidence is matched by exact accession, selected species, residue, and protein position. OGT-PIN evidence is protein-level and matched by accession and selected species. When an accession has a tracked Atlas sequence, the Workbench verifies the submitted sequence and suppresses evidence on mismatch. The export reports whether this sequence check was verified, unavailable, mismatched, or impossible because the identifier was not recognized. Missing evidence means “not reported” in these tracked releases; it is not proof of absence. FASTA identifiers without a recognized UniProt accession still receive predictions but cannot be evidence-matched. Every FASTA record must have a unique identifier.

The versioned export contract is defined by `public/static/js/workbench-core.js`. CSV and JSON include protein identifier, species, sequence length, sequence-verification status, site, sequence window, prediction score, confidence band, model version, Atlas status/count/PMIDs, and OGT-PIN status/count. The score is not a universally calibrated biological probability. The interface intentionally calculates no composite score.

Run:

```bash
npm run test:workbench:unit
npm run test:workbench:browser
```

After the prospective 2027-01-31 corpus freeze, `python3 prediction-v2/tools/check_release.py` is a necessary but insufficient partial automated check. A successful run does not authorize PRED-DL 2.0 release or labeling. Do not release PRED-DL 2.0 or label Workbench output as PRED-DL 2.0 unless every documented release criterion in the [prospective study protocol](NAR-STUDY-PROTOCOL.md) has passed the future comprehensive executable gate.
