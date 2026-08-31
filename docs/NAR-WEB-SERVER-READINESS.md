# NAR Web Server readiness

The public resource must remain registration-free, free of analytics tracking
and advertising cookies, usable in current browsers, and documented with
one-click examples, interpretation limits, canonical citations, licenses, and
model cards. This is an internal preparation roadmap, not a submission,
editorial ruling, or claim that a PRED-DL 2.0 release exists.

## Dated preparation sequence

| Period | Required work and boundary |
| --- | --- |
| September–October 2026 | Team confirms authorship and affiliations; verifies the eligibility route/date; finalizes use-case inputs, comparator manifest, analysis scripts, and the institutional usability-study determination. |
| From November 2026 | After team approval, use the current NAR proposal process to request an eligibility/suitability ruling. Do not assume the two-year rule is satisfied. |
| Through 2027-01-31 | Update provenance and pipeline only. Do not inspect or use post-freeze temporal-test results for model selection. |
| February–April 2027 | Freeze the corpus; run selection, calibration, comparators, browser/Python parity, use cases, and usability analysis; require the release gate. |
| After validation and confirmed eligibility | Create the archival release/DOI, freeze proposal evidence, and submit the proposal. Write a manuscript only after invitation or approval. |

## Status

| Area | Status | Remaining boundary |
| --- | --- | --- |
| Engineering | Complete baseline: the current Workbench remains browser-local, registration-free, and tracking-free. | Preserve privacy, browser support, examples, interpretation limits, citations, licenses, model cards, and ongoing operational checks. |
| Team | Pending | Confirm authorship, affiliations, proposal mechanism, and approval to request an editorial ruling. |
| Scientific | Pending and prospective | Freeze the corpus after 2027-01-31; complete the prespecified benchmark, calibration, comparator, parity, use-case, and usability work; pass the release gate before any v2 claim. |
| Editorial | Pending | Confirm eligibility, including how the two-year interval for the 2025 article is measured; do not treat internal preparation as editorial approval. |
| Archival | Pending | After final validation, create a versioned archival release and DOI with required provenance and artifacts. |

## Linked preparation documents

- [Draft NAR suitability inquiry](NAR-SUITABILITY-INQUIRY.md) — internal and
  unsent; authorship and affiliations require team confirmation.
- [Prospective NAR study protocol](NAR-STUDY-PROTOCOL.md) — no results and no
  released PRED-DL 2.0 model are implied.
- [Privacy-preserving adoption evidence framework](NAR-ADOPTION-EVIDENCE.md)
  — an internal evidence gate, not an NAR rule.

## Operational checks

- Cloudflare Browser Insights/RUM is operationally disabled, but it remains a
  permanent gate: it is injected at the edge and cannot be disabled by this
  repository alone.
- Production QA must show no request to Cloudflare Insights, `/cdn-cgi/rum`,
  Google Analytics, or Tag Manager.
- Code is Apache-2.0; original project data/content are CC BY 4.0;
  third-party material retains its own terms.
- Maintain at least annual browser, dependency, link, data-release, and
  recovery tests.
