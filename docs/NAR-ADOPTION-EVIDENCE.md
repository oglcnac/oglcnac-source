# Privacy-preserving adoption evidence framework

## Purpose and boundary

This internal framework describes how the project may demonstrate independent
community adoption for a future NAR Web Server proposal without adding client
analytics, cookies, tracking, or upload telemetry. It does not report adoption
results, establish an NAR requirement, or authorize a change to the public
Workbench's registration-free, browser-local privacy posture.

Evidence and claims are not interchangeable. Repository stars and page views
are not users. A scholarly citation does not establish current use without
full-text verification of a use statement. Team demonstrations are not
independent adoption. Every proposed statement must retain the limits of its
source and collection method.

## Acceptable evidence categories

1. **Verified external scholarly citation or use statement.** Search DOI and
   PMID indexes with a dated, reproducible strategy, then review the full text
   to verify a statement that the external work used the resource. Record a
   citation as a citation, rather than as evidence of current use, when this
   verification is unavailable.
2. **Public repository and release activity.** Record public stars, forks,
   external issues or discussions, and release downloads when that count is
   available. Label these measures as *engagement*, not users or adoption.
3. **Consented, independently recruited usability evaluation.** Obtain an
   institutional IRB, exemption, or not-human-subjects determination before
   recruitment. Retain only de-identified aggregate results; do not retain
   sequences or CSV contents. The prospective study design is in
   [NAR-STUDY-PROTOCOL.md](NAR-STUDY-PROTOCOL.md).
4. **Independently supplied documented use.** With written permission, record
   an external case study, teaching use, or feedback quotation and its agreed
   attribution. Do not convert an unapproved anecdote or a team demonstration
   into an independent-use claim.

## Prohibited collection and tracking

The public resource must not use Cloudflare Browser Insights/RUM,
`/cdn-cgi/rum`, Google Analytics, Google Tag Manager, permanent or tracking
cookies, fingerprinting, IP or user-agent profiling, hidden telemetry, or any
other client-behavior collection. It must not collect submitted FASTA or CSV
content. A consented study is a separately approved research activity, not an
exception that permits passive collection from public visitors.

## Evidence register

Use one register row per source, observation, or permitted statement. The
register must include the following fields:

| Field | Record |
| --- | --- |
| Evidence ID/type | Unique identifier and one evidence category above |
| Source | DOI/PMID search source, public repository/release, study, or permitted external source |
| Collection date | Date the observation or verification was collected |
| Coverage window | Dates or release interval represented |
| Reproducible query/definition | Exact search query, filter, counting definition, or study protocol version |
| Public or permission status | Public source or written-permission reference |
| Aggregate value/statement | Aggregate engagement value or verified, carefully scoped statement |
| Snapshot/hash or stable URL | Non-sensitive snapshot hash, stable URL, or archived identifier |
| Limitations | What the evidence cannot establish |
| Independent reviewer | Second person who audited the record |

### Blank template

| Evidence ID/type | Source | Collection date | Coverage window | Reproducible query/definition | Public or permission status | Aggregate value/statement | Snapshot/hash or stable URL | Limitations | Independent reviewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

No entries or counts are invented in this document.

## Collection, verification, and internal readiness gate

Collect and review evidence quarterly. On the proposal date, freeze the
register and its allowed snapshots; screen duplicate sources, verify full text
for citations, and have a second person audit each prospective claim and its
limitations. Preserve the dated query strategy and search coverage so a later
reader can reproduce what was checked.

The project's **internal** readiness gate, not an NAR rule, requires at least
two independent evidence categories. At least one must be either a verified
external citation/use statement or an independently supplied, documented use
case. This gate does not claim that NAR sets a numerical adoption threshold and
does not substitute for editor guidance or eligibility confirmation.

Public, non-sensitive snapshots may later be placed in a versioned project
release/DOI archive or another project-designated public evidence archive.
Consent forms, contact details, IP addresses, raw participant data, and
unpublished user sequences remain outside Git. The proposal sequence and
editorial boundary are described in
[NAR-WEB-SERVER-READINESS.md](NAR-WEB-SERVER-READINESS.md).
