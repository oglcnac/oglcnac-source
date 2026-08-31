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
workflows. Correctness and efficiency claims use the fixed decision rules in
Section 8, not passive usage telemetry. A favorable workflow result may be
reported even if no v2 model is released; it does not relabel v1 as v2.

### 1.2 Prospective-model question

**Question.** After the corpus freeze, does PRED-DL 2.0 materially improve
frozen temporal-test predictive discrimination relative to the published v1
candidate while maintaining CI-based calibration non-inferiority and an
artifact small enough for practical browser execution?

**Success criteria.** Candidate selection is based only on the frozen
validation procedure in Section 4. A material predictive-discrimination claim
requires all prespecified temporal-test discrimination, calibration
non-inferiority, and browser-feasibility criteria in Section 4. Calibration
non-inferiority is CI-based; a calibration improvement is a separate claim
with its own paired-confidence-interval rule.
The selected candidate must also meet all release gates, including the required
temporal-test report, external comparators, browser/Python parity, and archived
artifacts. The study will report performance and artifact constraints rather
than infer an improvement from model architecture alone.

### 1.3 Neutral outcome path

If no prospective v2 candidate materially improves predictive discrimination
while maintaining CI-based calibration non-inferiority and browser feasibility
under this protocol, the public predictor remains O-GlcNAcPRED-DL 1.0. The
report may instead describe the evaluated integrated browser-local workflow and
its usability outcome, with v1 identified accurately. It must not call that
result PRED-DL 2.0, imply a model upgrade, or transform a workflow benefit into
a prediction-performance claim.

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

Before the corpus freeze, construct connected components on the candidate
corpus using undirected PMID, protein-accession, and sequence-cluster edges.
The current temporal windows are binding:

| Split | Publication-date window | Permitted use |
| --- | --- | --- |
| Train | Through 2023-12-31 | Candidate fitting only |
| Validation | 2024-01-01 through 2024-12-31 | Candidate selection, thresholding, and calibration fitting/freezing only |
| Untouched temporal test | 2025-01-01 through 2027-01-31 | Final evaluation only, after model selection and calibration freeze |

PMID, protein accession, and sequence cluster are indivisible leakage groups:
all members of a connected component must remain in one split. Sequence
clusters are constructed at no more than 30% sequence identity and at least
80% coverage. If a component contains records from more than one temporal
window, exclude the entire component from the benchmark corpus before freeze.
Preserve every excluded record in a hashed exclusion ledger with reason
`cross_window_group`; allow it only in a clearly labeled descriptive analysis,
never in model fitting, selection, calibration, temporal testing, or the
primary benchmark. An unresolved component blocks corpus freeze and release.

After exclusions, assign every retained benchmark record exactly once in
`prediction-v2/splits/assignments.csv`. Every retained record must satisfy the
date bounds of its assigned split, and every PMID, protein accession, and
sequence-cluster group must occur in one split only. Freeze and archive the
component algorithm/version, all edge inputs, retained-component assignments,
and the exclusion-ledger SHA-256. No temporal-test record, score, error
analysis, or calibration result may affect candidate choice, model size choice,
threshold selection, calibration method, or calibration binning.

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

### 4.3 Material predictive-discrimination, calibration, and browser-feasibility decision rules

Call v2 a material predictive-discrimination improvement only if all of the
following are met on the untouched temporal test relative to released v1:

| Criterion | Required result |
| --- | --- |
| Primary discrimination | Macro-species AUPRC improves by at least +0.01, and the paired-bootstrap 95% confidence-interval lower bound for the v2-minus-v1 difference is greater than 0. |
| Species safeguards | Neither human nor mouse AUPRC decreases by more than 0.01. |
| Calibration non-inferiority | Neither Brier score nor ECE point estimate worsens by more than 0.01, and for both metrics the paired-bootstrap 95% confidence-interval upper bound for the v2-minus-v1 difference is at most +0.01. |
| Browser payload | The compressed model/runtime addition relative to v1 is at most 25 MiB. |
| Browser memory | Peak JavaScript heap is at most 512 MiB. |
| Browser runtime | On every frozen reference browser/device, median runtime is at most 30 seconds per 1,000 candidate sites. |

Report each browser-feasibility measurement alongside its relative v1 value.
Freeze the reference hardware, operating system, browser and version, runtime,
input fixture, warm-up count, and measured-run count before test execution.
Use the paired, species-stratified protein-cluster bootstrap in Section 4.4
for the v2-minus-v1 inference. Call calibration non-inferior only when both
the point-estimate and paired-confidence-interval requirements in the table
are met for both Brier score and ECE. Do not claim a calibration improvement
unless both Brier score and ECE are lower for v2 than v1 and both
paired-bootstrap 95% confidence intervals for the v2-minus-v1 differences have
upper bounds below 0. Otherwise report calibration as non-inferior, worse, or
indeterminate according to the prespecified results; do not use
calibration-improvement language. If any criterion in this table fails, retain
v1 as the public predictor and report the outcome as neutral rather than as a
v2 predictive-discrimination improvement.

### 4.4 Uncertainty estimation

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

### 6.1 Mandatory browser/device matrix

The following matrix is the minimum evidence for a v2 browser-feasibility
claim and release. Apply every threshold in Section 4.3 to each mandatory
platform and report the corresponding relative-v1 value.

| Mandatory platform | Required configuration |
| --- | --- |
| Automated compatibility matrix | Playwright-bundled Chromium, Firefox, and WebKit on Ubuntu 24.04 x86_64, each at 1440x1100 and 390x844 emulation. |
| Desktop physical-device matrix | Current stable Chrome and current stable Firefox on an x86_64 desktop reference with at least 4 cores and 8 GiB RAM. |
| macOS physical-device matrix | Current stable Safari on arm64 macOS with at least 8 GiB RAM. |
| Android physical-device matrix | Current stable Chrome on an Android arm64 device with 4 GiB RAM. |
| iPhone physical-device matrix | Current and immediately previous major Mobile Safari on iPhone devices with at least 4 GiB RAM. |

Before testing, freeze the exact hardware model, operating-system version,
browser version, power mode, thread settings, input fixture, warm-up count,
and measured-run count for every matrix entry. Automated emulation is
compatibility evidence only; it is not a substitute for physical-device
performance evidence. A missing mandatory platform blocks the v2
browser-feasibility claim and v2 release, although its available results may be
reported as incomplete.

## 7. Prospective biological use cases

No actual protein, site, result, interpretation, or biological finding is
selected or claimed in this protocol. Before narrative drafting or human case
review, freeze the candidate pool, machine-executed selection rule, inputs,
and ranking fields for each case. Hash the input FASTA, identifiers, species,
expected sequence snapshots, chosen data releases, selection-rule version, and
analysis version. The selector must write and preserve the full
candidate/ranking table, its SHA-256, the selection execution record, and the
complete result export before human review. If a case has zero eligible
candidates, report it as unavailable without relaxing criteria. Retain a
human-readable record of domain-expert interpretation. Interpretations must
cite the supporting literature and state which statements are prediction,
curated evidence, or biological hypothesis.

| Case | Prospective selection rule and required display | Guardrails |
| --- | --- | --- |
| A. Experimentally supported site reconciliation | Candidate pool: sequence-verified, Atlas-supported candidates. Rank by Atlas record count descending, unique PMID count descending, accession ascending, then position ascending. Select the first eligible candidate. Display sequence-verification state; exact accession, position, residue, and species evidence; associated PMIDs; and prediction context. | Join Atlas evidence only on exact accession, selected species, residue, and protein position. No cross-species or cross-site joins. A sequence mismatch suppresses evidence. |
| B. Candidate prioritization | Candidate pool: sites with score above the frozen decision threshold, Atlas absent in the frozen release, and OGT-PIN present. Rank by score descending, OGT evidence count descending, accession ascending, then position ascending. Select the first eligible candidate. | Label the result a hypothesis requiring experimental validation, not a discovery. Atlas absence remains “not reported,” not biological absence. Keep prediction, Atlas, and protein-level OGT-PIN fields distinct. |
| C. Human/mouse comparison | Candidate pool: human/mouse ortholog pairs with an aligned S/T. Rank by ortholog source-confidence descending, alignment coverage descending, then accession-pair ascending. Select the first eligible pair. The selection must not use prediction or evidence outcomes. | Do not treat site coordinates as homologous merely because proteins are orthologs. State a site mapping only if the archived alignment establishes the mapping, and preserve the alignment/version/hash. |

Every case requires review and written interpretation by a qualified domain
expert with cited literature. The case report must include both complete exports
and the frozen selection manifest, including case exclusions and any sequence
verification failure. Cases illustrate an evaluated workflow; they do not
substitute for the benchmark or establish experimental validation.

## 8. Consented usability evaluation

Recruit at least eight independent intended users. Obtain consent before data
collection, use fixed synthetic or public task inputs only, and compare manual
component-tool and Workbench workflows in a counterbalanced crossover order.
Do not collect submitted user protein sequences or CSV files. The protocol
records, for each task and participant, completion status, predefined
interpretation errors, elapsed time, SUS responses, and qualitative feedback.
Predefine the task answers and error taxonomy before recruitment; examples
include selecting an incorrect species/site/residue, using evidence despite a
sequence mismatch, conflating protein-level OGT-PIN context with site-level
evidence, and treating “not reported” as absence.

Each fixed task has a 15-minute timeout. An incomplete task or an incorrect
critical interpretation is a failure and receives an elapsed time of 15
minutes. The primary correctness endpoint is paired critical-error-free
completion. Claim a correctness improvement only when the 95%
participant-cluster paired-bootstrap confidence interval for the Workbench
minus component-workflow completion difference is entirely greater than 0.
Define each within-participant time reduction as 100 × (component-workflow
time − Workbench time) / component-workflow time. Claim an efficiency
improvement only when the 95% confidence interval for the median
within-participant time reduction is entirely at least 10%, and the lower bound
of the correctness-difference interval is at least -0.05. Otherwise report
neutral or mixed results. Use 10,000 paired-bootstrap replicates with seed
20270131; SUS is descriptive only, and no threshold or decision rule may
change post hoc.

Assign random participant identifiers solely for transient paired analysis.
Keep the consent/contact key separately under the approved procedure. Within
30 days after aggregate verification, delete participant-level task data and
destroy the linkage; retain only de-identified aggregate results and analysis
code. The institutional determination controls when it requires stricter
handling. This evaluation is not passive web tracking: the public Workbench
remains registration-free and does not collect analytics or behavioral
telemetry outside explicit, consented study sessions.

## 9. Artifacts, reporting, and release decision

The following output map extends, and must not weaken, the required-artifact
release checklist.

| Required output | Release-checklist location or linked archive |
| --- | --- |
| Frozen corpus records, provenance, record count, and SHA-256 | `corpus/records.csv`, `corpus/manifest.json` |
| One-to-one retained-record split assignments, component inputs, and leakage checks | `splits/assignments.csv` and split-analysis manifest |
| Cross-window component exclusions | Hashed exclusion ledger with reason `cross_window_group` |
| Scripts, environment lock, and frozen analysis configuration | Versioned source/data/model archive |
| Aggregate and per-species metrics, candidate sizes, runtime, memory, failure counts, mandatory browser/device-matrix results, and relative-v1 feasibility values | `benchmarks/metrics.json` and linked report |
| Bootstrap configuration and 95% intervals | `benchmarks/bootstrap-confidence-intervals.json` |
| Comparator metadata, raw outputs where redistribution permits, exclusions, and failures | `benchmarks/comparators.json` and linked archive |
| Held-out calibration procedure, Brier/ECE point estimates and paired confidence intervals, reliability plots, and frozen binning rule | `calibration/report.json` and frozen analysis manifest |
| Intended use, limitations, and validation summary | `models/model-card.md` |
| Hashed browser artifacts and manifest | `models/browser/manifest.json` |
| Full browser/Python outputs, manifests, and tolerance result | `parity/browser-python.json` and linked archive |
| Use-case candidate pools/rankings, selection inputs, FASTA/identifier hashes, outputs, expert interpretation, and cited literature | Versioned use-case archive |
| Consent procedure, fixed synthetic/public tasks, de-identified aggregate usability results, SUS, qualitative summary, and analysis code | Versioned usability protocol/results archive |

Public v2 release and v2 manuscript claims are blocked by a failure of the
Section 4.3 material predictive-discrimination, calibration non-inferiority,
or mandatory browser-feasibility criteria; any leakage; unresolved
cross-window component; provenance gap; incomplete comparator evaluation;
browser/Python parity failure; unavailable required artifact; or failed release
gate. The calibration non-inferiority release gate uses the Section 4.3
point-estimate and paired-confidence-interval requirements for both Brier score
and ECE. A calibration-improvement claim is additionally blocked unless both
metrics meet the separate paired-confidence-interval rule in Section 4.3. The
release gate is run with
`python3 prediction-v2/tools/check_release.py`; it must pass only after the
corpus freeze and complete scientific artifacts are present. Passing
file-presence checks alone is insufficient.

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
