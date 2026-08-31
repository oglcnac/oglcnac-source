const test = require("node:test");
const assert = require("node:assert/strict");

const workbench = require("../../public/static/js/workbench-core.js");

test("recognizes canonical UniProt accessions in common FASTA headers", () => {
  assert.equal(workbench.uniprotAccession("sp|P18583|SON_HUMAN"), "P18583");
  assert.equal(workbench.uniprotAccession("tr|A0A024RBG1|A0A024RBG1_HUMAN"), "A0A024RBG1");
  assert.equal(workbench.uniprotAccession("P18583"), "P18583");
  assert.equal(workbench.uniprotAccession("local-protein"), "");
});

test("joins site-level Atlas and protein-level OGT-PIN evidence", () => {
  const indexes = workbench.buildEvidenceIndexes(
    [
      { accession: "P18583", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" },
      { accession: "P18583", position_in_protein: "15", pmid: "456", ambiguous: "unambiguous" },
      { accession: "P18583", position_in_protein: "18", pmid: "999", ambiguous: "ambiguous" },
    ],
    [
      { uuid_b: "P18583", pubmed_id: "88" },
      { uuid_b: "P18583", pubmed_id: "89" },
    ],
  );
  assert.deepEqual(workbench.atlasEvidence(indexes, "P18583", 15), {
    status: "unambiguous",
    recordCount: 2,
    pmids: ["123", "456"],
  });
  assert.deepEqual(workbench.ogtPinEvidence(indexes, "P18583"), {
    status: "reported interactor",
    evidenceCount: 2,
  });
});

test("creates the versioned Workbench result contract without relabeling model v1", () => {
  const rows = workbench.enrichPredictions({
    records: [{ id: "sp|P18583|SON_HUMAN", sequence: "AAAAAAAAAAAAAASAAA" }],
    predictions: [{ id: "sp|P18583|SON_HUMAN", position: 15, residue: "S", window: "XXXXXXXXXXXXXXSAAAAAAAAAAAAAA", score: "0.951", confidence: "++" }],
    indexes: workbench.buildEvidenceIndexes(
      [{ accession: "P18583", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" }],
      [{ uuid_b: "P18583" }],
    ),
    species: "human",
    modelVersion: "1.0.0",
  });
  assert.deepEqual(Object.keys(rows[0]), workbench.RESULT_FIELDS);
  assert.equal(rows[0].protein_id, "sp|P18583|SON_HUMAN");
  assert.equal(rows[0].sequence_length, 18);
  assert.equal(rows[0].model_version, "O-GlcNAcPRED-DL 1.0.0 (human)");
  assert.equal(rows[0].atlas_status, "unambiguous");
  assert.equal(rows[0].ogt_pin_status, "reported interactor");
});

test("exports every versioned field as CSV and JSON", () => {
  const row = Object.fromEntries(workbench.RESULT_FIELDS.map((field) => [field, field === "atlas_pmids" ? ["1", "2"] : "value"]));
  const csv = workbench.toCsv([row]);
  assert.equal(csv.split("\n")[0], workbench.RESULT_FIELDS.join(","));
  assert.match(csv, /"1; 2"/);
  assert.deepEqual(JSON.parse(workbench.toJson([row]))[0].atlas_pmids, ["1", "2"]);
});
