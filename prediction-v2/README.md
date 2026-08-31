# Prospective O-GlcNAcPRED-DL 2.0 workflow

This directory defines the preregistered-style protocol and fail-closed release gate for a future model. It does **not** contain or claim a PRED-DL 2.0 model.

The corpus freezes on 2027-01-31. Publication dates and source provenance must be recorded for every site. Only unambiguous sites are positives; ambiguous sites remain a separate analysis stratum. Unlabeled S/T sites are not asserted to be negatives. PMID, protein, and sequence-cluster groupings prevent leakage across splits.

Model selection uses macro-species validation AUPRC. If candidates are within 0.01 AUPRC, the smaller browser model wins. The temporal test remains untouched until selection and calibration are frozen. The final report must include AUPRC, AUROC, MCC, F1, sensitivity, specificity, Brier score, ECE, and stratified bootstrap confidence intervals, plus functioning external comparators.

Run `python3 prediction-v2/tools/check_release.py`. It intentionally fails until the freeze date and every required scientific artifact exists. Never copy an experimental artifact into `public/static/prediction/v2/` unless this gate passes and Python/browser parity is verified.
