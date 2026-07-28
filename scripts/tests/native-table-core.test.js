const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
const tables = require("../../frontend/static/js/table-utils.js");
delete global.window;

test("exports the dependency-free native table state API", () => {
  for (const name of ["filterRows", "pageRows", "sortRows", "rowsToText"]) {
    assert.equal(typeof tables[name], "function", `${name} must be exported`);
  }
});

test("filters and paginates large in-memory result sets without expanding a page", () => {
  const rows = Array.from({ length: 25000 }, (_, index) => [
    `P${String(index).padStart(5, "0")}`,
    index % 2 ? "mouse" : "human",
  ]);

  const filtered = tables.filterRows(rows, "human");
  const page = tables.pageRows(filtered, 7, 25);

  assert.equal(filtered.length, 12500);
  assert.equal(page.length, 25);
  assert.deepEqual(page[0], ["P00350", "human"]);
  assert.deepEqual(page.at(-1), ["P00398", "human"]);
});

test("sorts text and numeric scientific fields stably in either direction", () => {
  const rows = [
    ["P3", "10", "same"],
    ["P1", "2", "same"],
    ["P2", "2", "same"],
  ];

  assert.deepEqual(
    tables.sortRows(rows, 1, "asc"),
    [
      ["P1", "2", "same"],
      ["P2", "2", "same"],
      ["P3", "10", "same"],
    ],
  );
  assert.deepEqual(
    tables.sortRows(rows, 0, "desc").map((row) => row[0]),
    ["P3", "P2", "P1"],
  );
});

test("copies only visible rows while CSV includes the complete filtered result", () => {
  const headers = ["Accession", "Protein name"];
  const filtered = [
    ["P1", "Alpha, beta"],
    ["P2", 'Quoted "protein"'],
    ["P3", "Line\nbreak"],
  ];

  assert.equal(
    tables.rowsToText(headers, filtered.slice(1, 3), "\t"),
    'Accession\tProtein name\nP2\tQuoted "protein"\nP3\tLine break',
  );
  assert.equal(
    tables.rowsToText(headers, filtered, ","),
    'Accession,Protein name\r\nP1,"Alpha, beta"\r\nP2,"Quoted ""protein"""\r\nP3,"Line\r\nbreak"',
  );
});
