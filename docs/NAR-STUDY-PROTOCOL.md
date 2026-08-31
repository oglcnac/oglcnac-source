# Prospective NAR Study Protocol

## Status and scope

**Status:** Preregistered-style internal protocol. This document reports no results, and it does not describe a released PRED-DL 2.0 model. The prospective corpus is not frozen until **2027-01-31**. Until the release gate passes, the current public predictor is **O-GlcNAcPRED-DL 1.0**.

This protocol defines the confirmatory evaluation and prospective use cases for
a future Nucleic Acids Research Web Server submission. Its primary proposed
contribution is browser-local computation coupled to evidence-aware
interpretation: a user can inspect a prediction alongside distinct,
versioned, sequence-verified evidence fields while retaining input sequences in
the browser. It is not a database portal and it does not compute a composite
prediction/evidence score. A missing tracked evidence field means *not
reported* in that release; it is not evidence of biological absence.

This document does not change public software, data, model artifacts, or the
values in `prediction-v2/protocol.json`. It operationalizes those binding
values for the future study and release.

## 1. Research questions and success criteria

### 1.1 Integrated-workflow question

**Question.** Does the sequence-verified Workbench output allow intended users
to interpret O-GlcNAc prediction and evidence more correctly and efficiently
than manually using the corresponding component tools?

**Success criteria.** The consented usability evaluation in Section 8 must
show task completion, predefined interpretation-error counts, elapsed time,
System Usability Scale (SUS) responses, and qualitative feedback for both
workflows. The interpretation benefit is assessed from the prespecified task
outcomes, not from passive usage telemetry. A favorable workflow result may be
reported even if no v2 model is released; it does not relabel v1 as v2.

### 1.2 Prospective-model question

**Question.** After the corpus freeze, does PRED-DL 2.0 materially improve
frozen temporal-test prediction performance and calibration relative to the
published v1 candidate while retaining an artifact small enough for practical
browser execution?

**Success criteria.** Candidate selection is based only on the frozen
validation procedure in Section 4. The selected candidate must meet all
release gates, including the required temporal-test report, calibration,
external comparators, browser/Python parity, and archived artifacts. The
study will report performance and artifact constraints rather than infer an
improvement from model architecture alone.

### 1.3 Neutral outcome path

If no prospective v2 candidate materially improves prediction under this
protocol, the public predictor remains O-GlcNAcPRED-DL 1.0. The report may
instead describe the evaluated integrated browser-local workflow and its
usability outcome, with v1 identified accurately. It must not call that result
PRED-DL 2.0, imply a model upgrade, or transform a workflow benefit into a
prediction-performance claim.

## 2. Corpus freeze, labels, and provenance

### 2.1 Freeze rule

The corpus freeze date is **2027-01-31**. The frozen corpus must be represented
by `prediction-v2/corpus/records.csv` and a manifest that records the file's
SHA-256 and record count. The manifest, raw source snapshots where permitted,
and sequence snapshots are immutable inputs to model selection, calibration,
benchmarking, use-case selection, and release reporting. Corrections found
after freeze are documented as post-freeze issues and are not silently folded
into the confirmatory corpus.

Each corpus record must retain the following provenance fields.

| Field | Requirement |
| --- | --- |
| Identity and site | Record identifier, protein accession, position, residue, and species |
| Label status | Label and ambiguity status |
| Literature provenance | Publication date, PMID, and source |
| Sequence provenance | Sequence snapshot/version and the sequence-source provenance needed to reproduce the site coordinate |
| Integrity | SHA-256 manifests for frozen records, sequence snapshots, and derived inputs |

Every record must have a nonempty unique record identifier. The release
validator independently verifies the records-file SHA-256, record count, and
required core columns; this protocol additionally requires recording the
sequence snapshot/version in the frozen provenance material.

### 2.2 Label definition and estimand

Unambiguous experimentally supported sites are the only **positive** labels.
Ambiguous sites are retained as a distinct analysis stratum and are never
merged into primary positives. Other serine/threonine (S/T) sites are
**unlabeled** under a positive-unlabeled learning assumption; they are never
asserted to be experimentally verified negatives. All metric interpretation,
thresholding, and limitations must respect this label structure.

The primary confirmatory analysis uses unambiguous positives and the
prespecified unlabeled background. A separate ambiguity-stratum analysis is
reported without reinterpreting ambiguous or unlabeled sites as negatives.

## 3. Leakage-resistant split assignment

Split assignment is made once from the frozen corpus and stored in
`prediction-v2/splits/assignments.csv`. Every corpus record is assigned exactly
once. The current temporal windows are binding:

| Split | Publication-date window | Permitted use |
| --- | --- | --- |
| Train | Through 2023-12-31 | Candidate fitting only |
| Validation | 2024-01-01 through 2024-12-31 | Candidate selection, thresholding, and calibration fitting/freezing only |
| Untouched temporal test | 2025-01-01 through 2027-01-31 | Final evaluation only, after model selection and calibration freeze |

PMID, protein accession, and sequence cluster are indivisible leakage groups:
all members of each group must remain in one split. Sequence clusters are
constructed at no more than 30% sequence identity and at least 80% coverage.
If a group spans otherwise incompatible temporal windows, assign it without
splitting the group, document the conflict and resolution in the split
manifest, and verify that it does not place a group in multiple splits. No
temporal-test record, score, error analysis, or calibration result may affect
candidate choice, model size choice, threshold selection, calibration method,
or calibration binning.

## 4. Model selection, calibration, and evaluation

### 4.1 Candidates and selection lock

The only candidate classes are those in the binding protocol: `published_v1`,
`retrained_legacy`, and `compact_residual_multispecies`. Select the candidate
on the validation set using **macro-species AUPRC** as the primary metric. If
candidates are within **0.01 AUPRC** of the best validation candidate, select
the smaller browser artifact. Record each candidate's validation
macro-species AUPRC and compressed artifact size, the decision calculation,
and the selected-model identifier in the frozen benchmark manifest.

Before opening the temporal-test predictions, freeze the selected model,
inference threshold(s), calibration method and parameters, calibration binning
rule, corpus hash, split assignments, and analysis environment. Calibration
may use held-out data only; it must not use the temporal test. The binning rule
for reliability plots and ECE must be entered in the frozen analysis manifest
before test results are viewed, rather than selected after inspecting them.

### 4.2 Required evaluation outputs

The primary metric is macro-species AUPRC. Secondary metrics are AUROC, MCC,
F1, sensitivity, specificity, Brier score, and expected calibration error
(ECE). Report aggregate and per-species results, including human and mouse
results, plus the separate ambiguity stratum. Report every failure count and
denominator, runtime, peak memory, compressed browser artifact size, and the
browsers and versions tested. Do not suppress records with failed parsing,
unsupported input, model errors, or comparator errors; record their status and
reason separately from metric-eligible observations.

The final report must distinguish prediction discrimination from calibration.
Brier score, ECE, and reliability plots describe calibration; they do not turn
a score into a universally calibrated biological probability. The model card
must state intended use, limitations, and validation results substantively.

### 4.3 Uncertainty estimation

For each reported metric, calculate 95% percentile confidence intervals using
**10,000 deterministic species-stratified protein-cluster bootstrap
replicates** with seed **20270131**. Resample protein clusters within species;
all site-level observations belonging to a resampled protein remain together.
For a model-versus-model difference, use paired resampling: resample the same
species-stratified protein clusters for both models in every replicate. Store
the seed, replicate count, resampling unit, species strata, percentile method,
and metric definitions with the interval artifact. A non-estimable metric or
replicate is reported with its cause and count; it is not silently discarded.

## 5. External comparator protocol

The required comparator panel is **DeepO-GlcNAc** and **YinOYang 1.2**. These
are named prospectively to prevent selective addition after viewing results.
At execution, each is considered functioning only when its frozen benchmark
record has status `completed` and contains reproducible outputs for the
eligible temporal-test input. If either named service becomes unavailable,
changes terms to preclude the evaluation, cannot accept the eligible input, or
otherwise cannot complete, record that status and cause. It is not a completed
comparator and cannot be silently replaced, imputed, or omitted. A planned
replacement must be explicitly named and its selection rationale and
pre-test availability assessment frozen before temporal-test execution; release
still requires DeepO-GlcNAc and at least one additional functioning comparator
as required by `prediction-v2/protocol.json`.

For every comparator, freeze the following in
`prediction-v2/benchmarks/comparators.json` and its linked archive:

| Item | Frozen record |
| --- | --- |
| Identification | Name, version/release, URL, access date, license/terms |
| Capability | Species, supported input, threshold(s), invocation method, and output schema |
| Reproducibility | Raw output, input/corpus SHA-256, parser version, and status |
| Evaluation | Eligible records, exclusions and reasons, tool failures, and required metrics |

Run the identical eligible temporal-test sequences/sites through each interface
where its documented input and species support permit. Apply frozen
transformations from raw outputs to the common metric representation. Do not
silently impute absent scores or calls. An unavailable, failed, or incompatible
tool is reported as such, with the affected records and failure reason; it is
never described as completed. Redistribution of raw outputs follows the
recorded terms—where redistribution is prohibited, archive the permitted
provenance, invocation, checksums, and derived report without publishing
restricted raw content.

## 6. Browser/Python parity and browser feasibility

The browser and Python implementations must use the same frozen corpus hash
and versioned model artifacts. Archive full per-observation outputs and
manifests from both implementations. The maximum absolute score difference is
accepted only when it is **no greater than 1e-5** across the declared parity
input set; the parity report records the observed maximum, tolerance, corpus
SHA-256, artifact hashes, runtime versions, and pass/fail state. Any mismatch,
hash disagreement, missing archive, or tolerance exceedance fails closed and
blocks public v2 release and v2 manuscript claims.

Browser feasibility reporting includes compressed browser artifact size,
runtime, peak memory, supported browsers and versions, and failed or
unsupported execution counts. The browser artifact and its manifest must hash
every shipped model file.

## 7. Prospective biological use cases

No actual protein, site, result, interpretation, or biological finding is
selected or claimed in this protocol. Before any case outcome is reviewed by a
person, freeze and hash its machine-executed selection rule and input-only
eligibility manifest, including identifiers, input FASTA, species, expected
sequence snapshots, chosen data releases, and analysis version. The selector
must write its execution record and the complete result export before human
review. Retain a human-readable record of domain-expert interpretation.
Interpretations must cite the supporting literature and state which statements
are prediction, curated evidence, or biological hypothesis.

| Case | Prospective selection rule and required display | Guardrails |
| --- | --- | --- |
| A. Experimentally supported site reconciliation | Preselect an eligible accession/site from the frozen Atlas evidence source by a deterministic manifest rule. Display sequence-verification state; exact accession, position, residue, and species evidence; associated PMIDs; and the prediction context. | Join Atlas evidence only on exact accession, selected species, residue, and protein position. No cross-species or cross-site joins. A sequence mismatch suppresses evidence. |
| B. Candidate prioritization | Use the frozen machine-executed selector to choose a prediction-positive protein/site under the frozen threshold that is Atlas-absent in the frozen release and has independently curated OGT-PIN context. Freeze this deterministic predicate before case outcome review. | Label the result a hypothesis requiring experimental validation, not a discovery. Atlas absence remains “not reported,” not biological absence. Keep prediction, Atlas, and protein-level OGT-PIN fields distinct. |
| C. Human/mouse comparison | Preselect one human/mouse ortholog pair by a frozen identifier and provenance rule; run species-specific predictions and retrieve species-specific evidence. | Do not treat site coordinates as homologous merely because proteins are orthologs. State a site mapping only if the archived alignment establishes the mapping, and preserve the alignment/version/hash. |

Every case requires review and written interpretation by a qualified domain
expert with cited literature. The case report must include both complete exports
and the frozen selection manifest, including case exclusions and any sequence
verification failure. Cases illustrate an evaluated workflow; they do not
substitute for the benchmark or establish experimental validation.

## 8. Consented usability evaluation

Recruit at least eight independent intended users. Obtain consent before data
collection, use fixed task scripts, and compare manual component-tool and
Workbench workflows in counterbalanced order. The protocol records, for each
task and participant, completion status, predefined interpretation errors,
elapsed time, SUS responses, and qualitative feedback. Predefine the task
answers and error taxonomy before recruitment; examples include selecting an
incorrect species/site/residue, using evidence despite a sequence mismatch,
conflating protein-level OGT-PIN context with site-level evidence, and treating
“not reported” as absence.

Store only de-identified aggregate results for reporting. Keep consent records
separate from study data and retain only the minimum operational information
required by the approved study procedure. This evaluation is not passive web
tracking: the public Workbench remains registration-free and does not collect
analytics or behavioral telemetry outside explicit, consented study sessions.

## 9. Artifacts, reporting, and release decision

The following output map extends, and must not weaken, the required-artifact
release checklist.

| Required output | Release-checklist location or linked archive |
| --- | --- |
| Frozen corpus records, provenance, record count, and SHA-256 | `corpus/records.csv`, `corpus/manifest.json` |
| One-to-one split assignments and leakage checks | `splits/assignments.csv` and split-analysis manifest |
| Scripts, environment lock, and frozen analysis configuration | Versioned source/data/model archive |
| Aggregate and per-species metrics, candidate sizes, runtime, memory, failure counts, and browser support | `benchmarks/metrics.json` and linked report |
| Bootstrap configuration and 95% intervals | `benchmarks/bootstrap-confidence-intervals.json` |
| Comparator metadata, raw outputs where redistribution permits, exclusions, and failures | `benchmarks/comparators.json` and linked archive |
| Held-out calibration procedure, Brier/ECE, reliability plots, and frozen binning rule | `calibration/report.json` and frozen analysis manifest |
| Intended use, limitations, and validation summary | `models/model-card.md` |
| Hashed browser artifacts and manifest | `models/browser/manifest.json` |
| Full browser/Python outputs, manifests, and tolerance result | `parity/browser-python.json` and linked archive |
| Use-case selection inputs, FASTA/identifier hashes, outputs, expert interpretation, and cited literature | Versioned use-case archive |
| Consent procedure, fixed tasks, de-identified aggregate usability results, SUS, and qualitative summary | Versioned usability protocol/results archive |

Public v2 release and v2 manuscript claims are blocked by any leakage,
provenance gap, incomplete comparator evaluation, browser/Python parity
failure, unavailable required artifact, or failed release gate. The release
gate is run with `python3 prediction-v2/tools/check_release.py`; it must pass
only after the corpus freeze and complete scientific artifacts are present.
Passing file-presence checks alone is insufficient.

Only after validation is complete may the project create a versioned
source/data/model archive and obtain a DOI. The DOI archive must include the
release commit, immutable manifests and hashes, executable analysis scripts,
environment lock, model and browser artifacts, and all redistributable results
needed to audit the claims.

## 10. Reporting boundaries

Reports must separate: (1) prospective model discrimination and calibration,
(2) browser/Python implementation parity and browser resource use, (3)
evidence-aware workflow behavior, (4) illustrative biological hypotheses, and
(5) consented usability findings. No section may infer experimental validation,
biological absence, cross-species site equivalence, clinical utility, or
editorial approval from these evaluations. All public descriptions must retain
the actual model version and data release identifiers.
