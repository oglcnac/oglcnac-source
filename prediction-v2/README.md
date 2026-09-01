# Prospective O-GlcNAcPRED-DL 2.0 workflow

This directory defines the preregistered-style protocol and a partial automated check that is necessary but insufficient for a future model's release readiness. It does **not** contain or claim a PRED-DL 2.0 model.

The corpus freezes on 2027-01-31. The canonical publication date is the earliest verifiable public article, first-online, or ePub date, falling back to issue date and then PubMed publication date; preserve the chosen date, source, rule, and deterministic tie resolution. Only unambiguous sites are positives; ambiguous sites remain a separate analysis stratum. Unlabeled S/T sites are not asserted to be negatives. PMID, protein, and sequence-cluster groupings prevent leakage across splits.

Model selection uses macro-species validation AUPRC. If candidates are within 0.01 AUPRC, the smaller browser model wins. The temporal test remains untouched until selection and annotation-probability calibration are frozen. The final report must include AUPRC, AUROC, MCC, F1, sensitivity, specificity, Brier score, ECE, and stratified bootstrap confidence intervals, plus functioning external comparators. Brier/ECE estimate calibration to the probability that a site is recorded as positive in frozen Atlas ascertainment, not biological modification probability.

Run `python3 prediction-v2/tools/check_release.py` for its current subset of artifact and cross-artifact checks. A failure blocks release, but a successful run does not establish comprehensive release readiness. Never copy an experimental artifact into `public/static/prediction/v2/` based on this partial check alone.

The partial check validates more than file presence: corpus record/hash basics, one-to-one split assignments and selected leakage groups, selected-model logic, metric domains, selected comparator structure, basic calibration fields, browser artifact hashes, a declared parity tolerance, and model-card sections. It does not implement every criterion in the study protocol.

Before any public v2 release, implement and test the pending comprehensive executable gate tracked in `release-checklist.json`. It must cover v2-versus-v1 discrimination, paired calibration confidence intervals, parity at no more than 1e-5, mandatory browser/device payload/runtime/memory, named YinOYang and comparator requirements, the exclusion ledger, prospective use cases, fixed usability analysis, the environment lock, and the frozen analysis manifest.
