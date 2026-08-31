const test = require("node:test");
const assert = require("node:assert/strict");
const network = require("../../public/static/js/ogt-network-summary.js");

const records = [
  { uuid_b: "P1", gene_name_b: "A", ncbi_id_b: "Human", detection_method: "two hybrid", pmid: "1" },
  { uuid_b: "P1", gene_name_b: "A", ncbi_id_b: "Human", detection_method: "affinity", pmid: "2" },
  { uuid_b: "P2", gene_name_b: "B", ncbi_id_b: "Human", detection_method: "affinity", pmid: "2" },
  { uuid_b: "P3", gene_name_b: "C", ncbi_id_b: "Mouse", detection_method: "affinity", pmid: "3" },
];

test("summarizes current OGT-PIN records without counting repeated evidence as proteins", () => {
  const summary = network.summarize(records, "Human", 12);
  assert.equal(summary.recordCount, 3);
  assert.equal(summary.proteinCount, 2);
  assert.equal(summary.publicationCount, 2);
  assert.deepEqual(summary.nodes.map((node) => [node.accession, node.evidenceCount]), [["P1", 2], ["P2", 1]]);
});

test("lists normalized species and preserves an all-species option", () => {
  assert.deepEqual(network.speciesOptions(records), ["All species", "Human", "Mouse"]);
});
