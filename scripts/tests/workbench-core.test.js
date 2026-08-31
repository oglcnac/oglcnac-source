const test = require("node:test");
const assert = require("node:assert/strict");

const workbench = require("../../public/static/js/workbench-core.js");

test("recognizes canonical UniProt accessions in common FASTA headers", () => {
  assert.equal(workbench.uniprotAccession("sp|P18583|SON_HUMAN"), "P18583");
  assert.equal(workbench.uniprotAccession("tr|A0A024RBG1|A0A024RBG1_HUMAN"), "A0A024RBG1");
  assert.equal(workbench.uniprotAccession("P18583"), "P18583");
  assert.equal(workbench.uniprotAccession("local-protein"), "");
});

test("recognizes UniProt isoform accessions without collapsing the isoform", () => {
  assert.equal(workbench.uniprotAccession("P18583-2"), "P18583-2");
  assert.equal(workbench.uniprotAccession("sp|P18583-2|SON_HUMAN"), "P18583-2");
});

test("joins site-level Atlas and protein-level OGT-PIN evidence", () => {
  const indexes = workbench.buildEvidenceIndexes(
    [
      { accession: "P18583", species: "human", site_residue: "S", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" },
      { accession: "P18583", species: "human", site_residue: "S", position_in_protein: "15", pmid: "456", ambiguous: "unambiguous" },
      { accession: "P18583", species: "human", site_residue: "T", position_in_protein: "18", pmid: "999", ambiguous: "ambiguous" },
    ],
    [
      { uuid_b: "P18583", ncbi_id_b: "Homo sapiens (Human)", pmid: "88" },
      { uuid_b: "P18583", ncbi_id_b: "Homo sapiens (Human)", pmid: "89" },
    ],
  );
  assert.deepEqual(workbench.atlasEvidence(indexes, "P18583", 15, "S", "human"), {
    status: "unambiguous",
    recordCount: 2,
    pmids: ["123", "456"],
  });
  assert.deepEqual(workbench.ogtPinEvidence(indexes, "P18583", "human"), {
    status: "reported interactor",
    evidenceCount: 2,
  });
});

test("never joins Atlas evidence across residue or species boundaries", () => {
  const indexes = workbench.buildEvidenceIndexes(
    [{ accession: "P18583", species: "human", site_residue: "S", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" }],
    [{ uuid_b: "P18583", ncbi_id_b: "Homo sapiens (Human)", pmid: "88" }],
  );
  assert.equal(workbench.atlasEvidence(indexes, "P18583", 15, "T", "human").recordCount, 0);
  assert.equal(workbench.atlasEvidence(indexes, "P18583", 15, "S", "mouse").recordCount, 0);
  assert.equal(workbench.ogtPinEvidence(indexes, "P18583", "mouse").evidenceCount, 0);
});

test("rejects duplicate FASTA identifiers before predictions can be mis-associated", () => {
  assert.throws(
    () => workbench.assertUniqueRecordIds([{ id: "same" }, { id: "same" }]),
    /Duplicate FASTA identifier: same/,
  );
});

test("suppresses evidence when a recognized accession contradicts the tracked sequence", () => {
  const rows = workbench.enrichPredictions({
    records: [{ id: "P18583", sequence: "AAAAAAAAAAAAAASAAA" }],
    predictions: [{ id: "P18583", position: 15, residue: "S", window: "window", score: "0.900", confidence: "+" }],
    indexes: workbench.buildEvidenceIndexes(
      [{ accession: "P18583", species: "human", site_residue: "S", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" }],
      [{ uuid_b: "P18583", ncbi_id_b: "Homo sapiens (Human)" }],
    ),
    sequenceSnapshot: { sequences: { P18583: "DIFFERENTSEQUENCE" }, missing_accessions: [] },
    species: "human",
    modelVersion: "1.0.0",
  });
  assert.equal(rows[0].sequence_verification, "mismatch with tracked sequence");
  assert.equal(rows[0].atlas_status, "sequence mismatch");
  assert.equal(rows[0].atlas_record_count, 0);
  assert.equal(rows[0].ogt_pin_status, "sequence mismatch");
});

test("creates the versioned Workbench result contract without relabeling model v1", () => {
  const rows = workbench.enrichPredictions({
    records: [{ id: "sp|P18583|SON_HUMAN", sequence: "AAAAAAAAAAAAAASAAA" }],
    predictions: [{ id: "sp|P18583|SON_HUMAN", position: 15, residue: "S", window: "XXXXXXXXXXXXXXSAAAAAAAAAAAAAA", score: "0.951", confidence: "++" }],
    indexes: workbench.buildEvidenceIndexes(
      [{ accession: "P18583", species: "human", site_residue: "S", position_in_protein: "15", pmid: "123", ambiguous: "unambiguous" }],
      [{ uuid_b: "P18583", ncbi_id_b: "Homo sapiens (Human)" }],
    ),
    sequenceSnapshot: { sequences: { P18583: "AAAAAAAAAAAAAASAAA" }, missing_accessions: [] },
    species: "human",
    modelVersion: "1.0.0",
  });
  assert.deepEqual(Object.keys(rows[0]), workbench.RESULT_FIELDS);
  assert.equal(rows[0].protein_id, "sp|P18583|SON_HUMAN");
  assert.equal(rows[0].sequence_length, 18);
  assert.equal(rows[0].model_version, "O-GlcNAcPRED-DL 1.0.0 (human)");
  assert.equal(rows[0].atlas_status, "unambiguous");
  assert.equal(rows[0].ogt_pin_status, "reported interactor");
  assert.equal(rows[0].prediction_score, 0.951);
  assert.equal(rows[0].sequence_verification, "verified against tracked sequence");
  assert.equal("probability" in rows[0], false);
});

test("exports every versioned field as CSV and JSON", () => {
  const row = Object.fromEntries(workbench.RESULT_FIELDS.map((field) => [field, field === "atlas_pmids" ? ["1", "2"] : "value"]));
  const csv = workbench.toCsv([row]);
  assert.equal(csv.split("\n")[0], workbench.RESULT_FIELDS.join(","));
  assert.match(csv, /"1; 2"/);
  assert.deepEqual(JSON.parse(workbench.toJson([row]))[0].atlas_pmids, ["1", "2"]);
});
