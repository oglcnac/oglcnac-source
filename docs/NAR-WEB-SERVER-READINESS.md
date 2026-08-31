# NAR Web Server readiness

The public resource must remain registration-free, free of analytics tracking and advertising cookies, usable in current browsers, and documented with one-click examples, interpretation limits, canonical citations, licenses, and model cards.

## Scientific work still required

- Complete the prospective PRED-DL 2.0 corpus after 2027-01-31 and preserve PMID/date provenance.
- Run the frozen temporal and sequence-cluster-aware benchmark, calibration, bootstrap confidence intervals, external comparator evaluation, and browser/Python parity checks.
- Emphasize integrated evidence retrieval and private browser analysis if v2 does not materially improve prediction.
- Create a versioned archival release and DOI after final validation.
- Confirm with the NAR editors whether the two-year interval is measured from the 2025 article's publication date or issue date before proposing the new Web Server paper.

## Operational checks

- Cloudflare Browser Insights/RUM must be disabled in the Cloudflare dashboard; it is injected at the edge and cannot be disabled by this repository alone.
- Production QA must show no request to Cloudflare Insights, `/cdn-cgi/rum`, Google Analytics, or Tag Manager.
- Code is Apache-2.0; original project data/content are CC BY 4.0; third-party material retains its own terms.
- Maintain at least annual browser, dependency, link, data-release, and recovery tests.
