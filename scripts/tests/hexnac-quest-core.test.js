const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const hexnac = require("../../public/static/js/hexnac-quest-core.js");
const manifest = require("../../public/static/hexnac-quest/v1/model.json");

const fixtures = path.join(__dirname, "fixtures");
const examplePath = path.join(
  __dirname,
  "../../public/static/hexnac-quest/example_input_data.csv",
);

test("applies the exported logistic model and the strict decision boundary", () => {
  assert.equal(hexnac.classifyEta(0, manifest), "GalNAc");
  assert.equal(hexnac.classifyEta(Number.EPSILON, manifest), "GlcNAc");
  assert.equal(
    hexnac.classifyFeatures(
      { f126: 0, f138: 100, f144: 0, f168: 0, f186: 0 },
      manifest,
    ).pred_outcome,
    "GlcNAc",
  );
  assert.equal(
    hexnac.classifyFeatures(
      { f126: 0, f138: 0, f144: 100, f168: 0, f186: 0 },
      manifest,
    ).pred_outcome,
    "GalNAc",
  );
});

test("accepts reordered headers and preserves IDs, duplicate rows, order, and intensity text", () => {
  const csv = [
    "\ufeff f186 , f144 ,id,f138,f126,f168,ignored",
    '5,4,"001,alpha",3,2,1,x',
    '5,4,"001,alpha",3,2,1,y',
  ].join("\n");
  const parsed = hexnac.parseCsv(csv, manifest);

  assert.equal(parsed.totalRows, 2);
  assert.equal(parsed.invalidRows.length, 0);
  assert.deepEqual(
    parsed.validRows.map((row) => [
      row.id,
      row.f126,
      row.f138,
      row.f144,
      row.f168,
      row.f186,
    ]),
    [
      ["001,alpha", "2", "3", "4", "1", "5"],
      ["001,alpha", "2", "3", "4", "1", "5"],
    ],
  );
});

test("rejects missing or duplicate required headers", () => {
  assert.throws(
    () => hexnac.parseCsv("id,f126,f138,f144,f168\nx,1,2,3,4", manifest),
    (error) => error.code === "missing_headers" && error.missing.includes("f186"),
  );
  assert.throws(
    () =>
      hexnac.parseCsv(
        "id,f126,f138,f144,f168,f186,f126\nx,1,2,3,4,5,6",
        manifest,
      ),
    (error) => error.code === "duplicate_headers",
  );
});

test("ignores duplicate extra headers while still rejecting duplicate required headers", () => {
  assert.doesNotThrow(() =>
    hexnac.parseCsv(
      "id,f126,f138,f144,f168,f186,note,note\nx,1,2,3,4,5,a,b",
      manifest,
    ),
  );
  assert.throws(
    () =>
      hexnac.parseCsv(
        "id,f126,f138,f144,f168,f186,f126\nx,1,2,3,4,5,6",
        manifest,
      ),
    (error) =>
      error.code === "duplicate_headers" &&
      error.duplicates.length === 1 &&
      error.duplicates[0] === "f126",
  );
});

test("skips invalid rows with their CSV data-row number and concrete reason", () => {
  const csv = [
    "id,f126,f138,f144,f168,f186",
    "ok,1,2,3,4,5",
    "missing,,2,3,4,5",
    "text,nope,2,3,4,5",
    "negative,-1,2,3,4,5",
    "zero,0,0,0,0,0",
    "no-model-signal,0,0,0,1,1",
    "infinite,1e999,2,3,4,5",
  ].join("\n");
  const parsed = hexnac.parseCsv(csv, manifest);

  assert.equal(parsed.validRows.length, 1);
  assert.deepEqual(
    parsed.invalidRows.map(({ rowNumber, reason }) => [rowNumber, reason]),
    [
      [3, "f126 is missing"],
      [4, "f126 is not numeric"],
      [5, "f126 must be non-negative"],
      [6, "feature total must be greater than zero"],
      [7, "f126, f138, and f144 cannot all be zero"],
      [8, "f126 must be finite"],
    ],
  );
});

test("enforces the public file-size and row-count limits", () => {
  assert.doesNotThrow(() => hexnac.assertFileSize(25 * 1024 * 1024));
  assert.throws(
    () => hexnac.assertFileSize(25 * 1024 * 1024 + 1),
    (error) => error.code === "file_too_large",
  );
  assert.doesNotThrow(() => hexnac.assertRowCount(250000));
  assert.throws(
    () => hexnac.assertRowCount(250001),
    (error) => error.code === "too_many_rows",
  );
});

test("exports exactly the public result columns with RFC-compatible CSV quoting", () => {
  const csv = hexnac.exportResults([
    {
      pred_outcome: "GlcNAc",
      id: 'sample, "one"',
      f126: "1",
      f138: "2",
      f144: "3",
      f168: "4",
      f186: "5",
    },
  ]);

  assert.equal(
    csv,
    'pred_outcome,id,f126,f138,f144,f168,f186\r\nGlcNAc,"sample, ""one""",1,2,3,4,5',
  );
  assert.equal(
    hexnac.resultFilename("my.sample.csv"),
    "my.sample_Predicted_results.csv",
  );
});

test("matches every legacy R prediction in the canonical 10,000-row corpus", () => {
  const example = fs.readFileSync(examplePath, "utf8");
  const golden = fs
    .readFileSync(path.join(fixtures, "hexnac-quest-golden.csv"), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[1]);
  const parsed = hexnac.parseCsv(example, manifest);
  const actual = parsed.validRows.map(
    (row) => hexnac.classifyFeatures(row.numeric, manifest).pred_outcome,
  );

  assert.equal(parsed.totalRows, 10000);
  assert.equal(parsed.invalidRows.length, 0);
  assert.equal(actual.filter((value) => value === "GlcNAc").length, 9452);
  assert.equal(actual.filter((value) => value === "GalNAc").length, 548);
  assert.deepEqual(actual, golden);
});
