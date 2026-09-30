# Research workflows release goal

Status: complete, 2026-09-30. All five improvements are implemented, reviewed, tested, deployed and verified on the live website. Completion evidence is recorded in `RESEARCH-WORKFLOWS-RELEASE.md`.

## Deliverables and acceptance criteria

1. **Atlas → Workbench.** Protein records and selected collection accessions open a shareable preparation URL. Retrieve exact local Atlas sequences; never substitute isoforms. Show every requested accession and its preparation outcome. Human and mouse batches are separate; unsupported, ambiguous, missing and oversized inputs have explicit outcomes. A researcher inspects prepared FASTA before starting. Retain links to source records and show evidence links with analysis results. Existing manual FASTA input remains usable.
2. **Search suggestions.** Offer ranked accession, reported gene and protein-name matches, with species and match context. Exact accession/gene matches precede partial matches. Accessible combobox: Arrow keys, Enter, Escape, Tab and pointer input; no silent first-result selection. Multiple species/identifiers remain explicit. Suggestions use source-reported names and never claim external synonym resolution. Loading/failure/empty states preserve normal search.
3. **Publication explorer.** A searchable, filterable directory and stable PMID detail URLs expose only the studies represented in Atlas. Each study page reports original rows, distinct proteins and accession/species/position combinations, methods, samples, citations and missing fields; paper counts are not biological abundance. Link to evidence filtered by the selected PMID. Support selection, collections and exports containing complete source fields. Multi-PMID rows belong to each cited study; directory totals must not imply independent records.
4. **Scientific figure exports.** Export full or selected protein regions as self-contained SVG and 2× PNG. Include identity, sequence coordinates, original reported evidence, distinct ambiguity/conflict markers, compatible domains/regions, legend, active evidence filters and source metadata. Unmappable positions remain disclosed. Do not infer a correction or transfer incompatible annotations. Escape all source text; verify XML, geometry, raster dimensions, representative coordinates and downloaded image appearance.
5. **Research report packages.** Export a standard ZIP containing readable instructions, structured metadata, input FASTA, complete and filtered results, source evidence, citations, filters and dataset/model manifests. Include UTC timestamps and SHA-256 file checksums. Capture the completed run, independent of later form edits. Explicitly report unavailable citation metadata; fail transparently when essential provenance cannot be captured. Report original evidence separately from prediction. Workbench reports retain exact model configuration and input sequence hashes; Atlas reports retain the selected evidence scope and verified annotation state.

## Visual and quality standard

- Preserve the established blue/teal palette, compact scientific tables, restrained type and consistent actions.
- Inspect desktop and mobile screenshots at 320, 390, 768, 1440 and 1920 px, including long titles/names, keyboard focus, preparation outcomes, empty/error states, study details, figure preview and report actions. No page overflow, clipped controls or overlapping text.
- Exercise meaningful workflows in Chromium, Firefox and WebKit; run axe checks on new primary states and keyboard interactions. Validate cancellation, retries, inaccessible storage, missing metadata and navigation history where relevant.
- Verify counts against all source rows, preserve original scientific datasets byte-for-byte, and test exact accession/species/sequence constraints, export parity, archive checksums and malicious-looking source text handling.
- Run repository/public build, asset, route and link checks plus existing affected regression suites. New code has no external runtime service requirement.
- Measure representative workflows under mobile throttling: median LCP ≤2.5 s, maximum CLS ≤0.1 and directory/preparation readiness ≤8 s for representative small inputs. Report measurements and limits; prediction computation is measured separately.
- Commit with the established human author and committer only, preserve unrelated research work, push source, deploy the reviewed public artifact and repeat representative visual/functional checks against https://oglcnac.org/. No public source-repository links.

## Completion evidence

Record test counts, responsive screenshots, scientific parity checks, performance results, implementation/deployment commit IDs and live verification in `RESEARCH-WORKFLOWS-RELEASE.md`. Do not mark this goal complete until every deliverable is live and verified.
