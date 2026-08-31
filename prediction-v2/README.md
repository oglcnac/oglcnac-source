# Prospective O-GlcNAcPRED-DL 2.0 workflow

This directory defines the preregistered-style protocol and fail-closed release gate for a future model. It does **not** contain or claim a PRED-DL 2.0 model.

The corpus freezes on 2027-01-31. Publication dates and source provenance must be recorded for every site. Only unambiguous sites are positives; ambiguous sites remain a separate analysis stratum. Unlabeled S/T sites are not asserted to be negatives. PMID, protein, and sequence-cluster groupings prevent leakage across splits.

Model selection uses macro-species validation AUPRC. If candidates are within 0.01 AUPRC, the smaller browser model wins. The temporal test remains untouched until selection and calibration are frozen. The final report must include AUPRC, AUROC, MCC, F1, sensitivity, specificity, Brier score, ECE, and stratified bootstrap confidence intervals, plus functioning external comparators.

Run `python3 prediction-v2/tools/check_release.py`. It intentionally fails until the freeze date and every required scientific artifact exists. Never copy an experimental artifact into `public/static/prediction/v2/` unless this gate passes and Python/browser parity is verified.

The gate validates content, not just file presence. The corpus manifest must freeze the record count, provenance, date, and SHA-256 of a CSV containing record identifiers, accessions, positions, residues, species, labels, ambiguity status, publication dates, PMIDs, and sources. Split assignments must cover every record exactly once and keep PMID, protein, and sequence-cluster groups within one temporal split. Benchmark JSON must freeze the selected model, all required aggregate/per-species metrics, stratified-bootstrap intervals, completed comparators, and calibration. The browser manifest must hash every model artifact; the parity report must identify the corpus hash and pass a declared numeric tolerance. The model card must include substantive intended-use, limitation, and validation sections.
