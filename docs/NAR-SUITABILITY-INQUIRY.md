# Draft NAR Web Server Issue suitability inquiry

> **INTERNAL, UNSENT DRAFT — NOT SUBMITTED.** This draft has no editorial approval.
> The research team must confirm authorship, affiliations, and all submission
> details before sending it.

**To:** Nucleic Acids Research Web Server Issue editors
**Subject:** Suitability inquiry — *O-GlcNAc Workbench: integrated browser-local analysis for O-GlcNAc prediction and evidence retrieval*

Dear Web Server Issue Editors,

We would welcome your advice on the suitability of a prospective Web Server
Issue submission, provisionally titled *O-GlcNAc Workbench: integrated
browser-local analysis for O-GlcNAc prediction and evidence retrieval*. The
proposed resource is a public, HTTPS web application for researchers working
with human or mouse protein sequences and O-GlcNAc-related evidence. It is
registration-free, cookie-free, and tracking-free; it offers sample data,
tutorials, and rich downloadable CSV and JSON output. Submitted FASTA
sequences and CSV data remain in the visitor's browser. We intend to maintain
the resource for at least five years.

**Input.** Users paste or upload human or mouse FASTA sequences. Common FASTA
headers containing canonical UniProt accessions are recognized. The companion
HexNAcQuest application separately accepts its documented CSV format for local
glycan-classification computation; it is not presented as already integrated
into the Workbench.

**Output.** For each eligible sequence position, the Workbench returns
O-GlcNAcPRED-DL 1.0 prediction output, including score, confidence band,
sequence window, and model version. Its downloadable output also records
sequence-verification status and versioned Atlas and OGT-PIN evidence fields,
including status/count and associated PMIDs where available. The Workbench
does not create a composite score, and absent tracked evidence is reported as
not reported rather than evidence of biological absence.

**Processing method.** The fully static Workbench runs local computation in
the browser, applying the released O-GlcNAcPRED-DL 1.0 model to each submitted
sequence. It then joins prediction output with versioned, sequence-verified
O-GlcNAcAtlas and OGT-PIN records. Atlas matching uses accession, selected
species, residue, and protein position; OGT-PIN matching is protein-level by
accession and selected species. Where a tracked Atlas sequence exists, the
submitted sequence is checked and evidence is suppressed on mismatch.

**Novelty and benefit over separate applications.** The central contribution
is not a portal that merely links independent resources. It brings local
sequence analysis together with explicit, versioned evidence retrieval in one
browser-local workflow, allowing users to interpret prediction output alongside
sequence-verified Atlas and OGT-PIN context while retaining their inputs on
their own device. Separate prediction, database, and interaction resources do
not provide this integrated, provenance-aware analysis and export contract;
the design deliberately leaves prediction and evidence as distinct fields
rather than implying a combined biological ranking.

**Prior publications.** O-GlcNAcAtlas: PMID 33442735, DOI 10.1093/glycob/cwab003.
O-GlcNAcAtlas 4.0: PMID 39988118, DOI 10.1016/j.jmb.2025.169033 (article date 2025-02-21; issue publication 2025-08-01). OGT-PIN: PMID 34502531, DOI 10.3390/ijms22179620.
O-GlcNAcPRED-DL: PMID 38054441, DOI 10.1021/acs.jproteome.3c00458.
HexNAcQuest: PMID 36122299, DOI 10.1021/jasms.2c00172; HexNAcQuest protocol:
PMID 38995536, DOI 10.1007/978-1-0716-4007-4_5.

**Keywords.** O-GlcNAcylation; protein sequence analysis; browser-local
computation; evidence integration.

**Authors and affiliations.** [To be confirmed by the research team.]

**Update/resubmission disclosure.** This would be a new suitability inquiry,
not an update or resubmission of a prior NAR Web Server Issue manuscript.

Could you advise whether this proposed integrated resource is in scope under
the current [Web Server Issue instructions](https://academic.oup.com/nar/pages/submission_webserver), and specifically whether it meets the minimum two-year
interval requirement in light of the 2025 O-GlcNAcAtlas 4.0 paper? If the
interval applies, should it be measured from its 2025-02-21 article date or its
2025-08-01 issue-publication date?

Thank you for your consideration.

Sincerely,
[Corresponding author/contact to be confirmed]

## Pre-submission checklist

- [ ] Team-confirmed authors
- [ ] Team-confirmed affiliations
- [ ] Corresponding author and contact details
- [ ] Final proposal mechanism and address
- [ ] Eligibility date confirmed with the editors
- [ ] Adoption evidence assembled
- [ ] Comparator list finalized
- [ ] Use cases completed
