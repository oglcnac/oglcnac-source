# NAR Web Server readiness

<!-- nar-status: formal_proposal=blocked_pending_independent_validation_and_team_approvals -->
<!-- nar-status: manuscript=blocked_pending_editor_invitation_or_approval -->
<!-- nar-status: comprehensive_release_gate=pending_implementation_and_test -->

The public site must remain registration-free and add no client analytics,
tracking, or advertising cookies. It must remain usable in current browsers and
documented with one-click examples, interpretation limits, canonical citations,
licenses, and model cards. This is an internal preparation roadmap, not a
submission, editorial ruling, or claim that a PRED-DL 2.0 release exists.

## Dated preparation sequence

| Period | Required work and boundary |
| --- | --- |
| September–October 2026 | Team inventories authorship, affiliations, eligibility questions, validation dependencies, and the institutional usability-study determination. No proposal is sent. |
| From November 2026 | Verify the current official NAR instructions and prepare only: refine the internal formal proposal draft, authorship/affiliations block, eligibility question, and evidence plan. Do not send the formal proposal before independent validation and team approvals are complete. |
| Through 2027-01-31 | Before 2027-01-31, finalize only use-case selection rules, schemas, and sources; never select cases. Update provenance and pipelines without inspecting or using temporal-test outcomes for model selection. |
| February–April 2027 | Freeze the corpus; run the prespecified selection, annotation-probability calibration, comparators, browser/Python parity, use cases, and fixed-n usability analysis. Complete independent scientific and engineering validation. |
| After independent validation and team approvals | Implement and test the comprehensive executable release gate, create the archival release/DOI, freeze proposal evidence, recheck current instructions, and send one formal suitability proposal cycle by email with the explicit editor eligibility question. Await the editorial ruling. |
| Only after editor invitation or approval | Prepare and submit a manuscript; do not treat sending the formal proposal as permission to submit one. |

## Status

| Area | Status | Remaining boundary |
| --- | --- | --- |
| Engineering | Complete source baseline: the current Workbench remains browser-local and registration-free, and the site adds no client analytics or tracking. | Preserve privacy, browser support, examples, interpretation limits, citations, licenses, model cards, and ongoing operational checks; verify the then-current deployment separately. |
| Release automation | Pending | Before public v2 release, implement and test one comprehensive executable gate over every documented criterion. The current `check_release.py` is necessary but insufficient. |
| Team | Pending | Confirm authorship, affiliations, formal proposal mechanism, independent-validation completion, and approval to send one formal proposal. |
| Scientific | Pending and prospective | Freeze the corpus after 2027-01-31; complete the prespecified benchmark, annotation-probability calibration, comparator, parity, use-case, and fixed-n usability work before any v2 claim. |
| Editorial | Pending | Confirm eligibility, including how the two-year interval for the 2025 article is measured; do not treat internal preparation as editorial approval. |
| Archival | Pending | After final validation, create a versioned archival release and DOI with required provenance and artifacts. |

## Linked preparation documents

- [Draft NAR suitability proposal](NAR-SUITABILITY-INQUIRY.md) — internal and
  unsent; authorship, affiliations, independent validation, and team approval
  remain required before the one formal email proposal.
- [Prospective NAR study protocol](NAR-STUDY-PROTOCOL.md) — no results and no
  released PRED-DL 2.0 model are implied.
- [Privacy-preserving adoption evidence framework](NAR-ADOPTION-EVIDENCE.md)
  — an internal evidence gate, not an NAR rule.

## Operational checks

- The repository and generated site must add no client analytics or tracking,
  including Cloudflare Browser Insights/RUM, `/cdn-cgi/rum`, Google Analytics,
  or Tag Manager.
- A hosting provider or CDN may process minimal request headers and
  network/security metadata under its own operational controls. The project
  must not use that metadata for user profiling or adoption counts.
- Before the formal proposal, separately verify and date the current deployed
  response headers, loaded scripts, browser network requests, hosting/CDN
  configuration, and project access to provider logs. Do not assume an earlier
  provider state is permanent.
- Code is Apache-2.0; original project data/content are CC BY 4.0;
  third-party material retains its own terms.
- Maintain at least annual browser, dependency, link, data-release, and
  recovery tests.
