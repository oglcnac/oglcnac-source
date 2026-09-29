const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("../../public/static/js/record-view.js");

test("protein summaries keep isoforms, species, and unidentified records distinct", () => {
  const records = [
    { accession: "P1", species: "Human", protein_name: "Name", position_in_protein: "12" },
    { accession: "P1", species: "human", protein_name: "A longer reported name", position_in_protein: "12" },
    { accession: "P1", species: "human", position_in_protein: "17" },
    { accession: "P1-2", species: "human", position_in_protein: "12" },
    { accession: "P1", species: "mouse", position_in_protein: null },
    { accession: "", species: "human" }, { accession: "", species: "human" },
  ];
  const groups = view.groupProteins(records);
  assert.equal(groups.length, 5);
  assert.equal(groups[0].recordCount, 3);
  assert.deepEqual(groups[0].positions, [12, 17]);
  assert.equal(groups[0].protein_name, "Name");
  assert.equal(groups[1].accession, "P1-2");
  assert.equal(groups[2].species, "mouse");
  assert.equal(groups.reduce((sum, group) => sum + group.recordCount, 0), records.length);
});
test("annotation filters retain mixed source values while numeric summaries exclude them", () => {
  const records = ["", null, "NA", "12/13", "0", "-1", "12", "13"].map((position, id) => ({ id, species: "human", position_in_protein: position }));
  assert.deepEqual(view.filterRecords(records, { position: "reported" }).map(r => r.id), [3, 4, 5, 6, 7]);
  assert.deepEqual(view.filterRecords(records, { position: "unreported" }).map(r => r.id), [0, 1, 2]);
  assert.deepEqual(view.positions(records), [12, 13]);
  assert.equal(view.filterRecords(records, { species: "mouse" }).length, 0);
  assert.equal(view.filterRecords(records, { species: "Human" }).length, 8);
});
test("publication links deduplicate identifiers and export fields retain sparse source fields", () => {
  const records = [{ pmid: "20068230; 22661428", condition: null }, { pmid: "20068230", p_value: "0.01", comments: "a,b\nquoted" }];
  assert.deepEqual(view.publications(records), ["20068230", "22661428"]);
  assert.deepEqual(view.exportFields(records), ["pmid", "condition", "p_value", "comments"]);
  assert.deepEqual(view.groupProteins([]), []);
});
