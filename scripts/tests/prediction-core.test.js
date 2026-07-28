const test = require("node:test");
const assert = require("node:assert/strict");

const prediction = require("../../frontend/static/js/prediction-core.js");

test("parses FASTA identifiers and normalizes sequences to uppercase", () => {
  assert.deepEqual(
    prediction.parseFasta(">alpha description\nastux\n>beta\nTT\n"),
    [
      { id: "alpha", sequence: "ASTUX" },
      { id: "beta", sequence: "TT" },
    ],
  );
});

test("creates 29-residue terminal windows centered on each S/T site", () => {
  const candidates = prediction.createCandidates([
    { id: "edge", sequence: "SAAAAAAAAAAAAAAT" },
  ]);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map(({ id, position, residue }) => ({ id, position, residue })),
    [
      { id: "edge", position: 1, residue: "S" },
      { id: "edge", position: 16, residue: "T" },
    ],
  );
  assert.equal(candidates[0].window.length, 29);
  assert.equal(candidates[0].window[14], "S");
  assert.equal(candidates[0].window.slice(0, 14), "X".repeat(14));
  assert.equal(candidates[1].window.length, 29);
  assert.equal(candidates[1].window[14], "T");
  assert.equal(candidates[1].window.slice(15), "X".repeat(14));
});

test("preserves FASTA record and residue order in candidate output", () => {
  const candidates = prediction.createCandidates([
    { id: "z-first", sequence: "TAS" },
    { id: "a-second", sequence: "ST" },
  ]);

  assert.deepEqual(
    candidates.map(({ id, position }) => [id, position]),
    [
      ["z-first", 1],
      ["z-first", 3],
      ["a-second", 1],
      ["a-second", 2],
    ],
  );
});

test("standardizes each AAindex column across the complete request", () => {
  assert.deepEqual(
    prediction.standardizeRows([
      [1, 2],
      [3, 2],
    ]),
    [
      [-1, 0],
      [1, 0],
    ],
  );
});

test("applies the published species-specific ensemble weights", () => {
  const outputs = [
    new Float32Array([0.1]),
    new Float32Array([0.2]),
    new Float32Array([0.3]),
    new Float32Array([0.4]),
    new Float32Array([0.5]),
  ];

  assert.ok(Math.abs(prediction.combineEnsemble("human", outputs)[0] - 0.355) < 1e-7);
  assert.ok(Math.abs(prediction.combineEnsemble("mouse", outputs)[0] - 0.345) < 1e-7);
});

test("derives confidence from the displayed three-decimal score", () => {
  assert.equal(prediction.confidenceForScore("0.991"), "+++");
  assert.equal(prediction.confidenceForScore("0.990"), "++");
  assert.equal(prediction.confidenceForScore("0.951"), "++");
  assert.equal(prediction.confidenceForScore("0.950"), "+");
  assert.equal(prediction.confidenceForScore("0.501"), "+");
  assert.equal(prediction.confidenceForScore("0.500"), "");
});

test("validates species-specific amino acid support", () => {
  assert.deepEqual(
    prediction.validateFasta(">human\nAUS", "human"),
    [{ id: "human", sequence: "AUS" }],
  );
  assert.throws(
    () => prediction.validateFasta(">mouse\nAUS", "mouse"),
    (error) => error.code === "unsupported_residue" && error.position === 2,
  );
});

test("rejects input above the public 200,000-character limit", () => {
  assert.throws(
    () => prediction.validateFasta(`>large\n${"A".repeat(200001)}`, "human"),
    (error) => error.code === "input_too_large",
  );
});

test("encodes AAindex flanks in residue-major property order", () => {
  const aaindex = {
    alphabet: "AS",
    species: { human: { properties: ["p1", "p2"] } },
    values: { p1: [1, 2], p2: [10, 20] },
  };
  const row = prediction.encodeAAIndexRow(
    `${"A".repeat(14)}S${"A".repeat(14)}`,
    aaindex,
    "human",
  );

  assert.equal(row.length, 56);
  assert.deepEqual(row, Array(28).fill([1, 10]).flat());
});

test("fits request-wide AAindex scaling without retaining all feature rows", () => {
  const aaindex = {
    alphabet: "AS",
    species: { human: { properties: ["p1", "p2"] } },
    values: { p1: [1, 2], p2: [10, 20] },
  };
  const candidates = [
    { window: `${"A".repeat(14)}S${"A".repeat(14)}` },
    { window: `${"S".repeat(14)}A${"S".repeat(14)}` },
  ];

  const scaler = prediction.fitAAIndexScaler(candidates, aaindex, "human");
  const batch = prediction.encodeAAIndexBatch(
    candidates,
    0,
    2,
    aaindex,
    "human",
    scaler,
  );

  assert.deepEqual(Array.from(batch.slice(0, 56)), Array(56).fill(-1));
  assert.deepEqual(Array.from(batch.slice(56)), Array(56).fill(1));
});

test("encodes word2vec bigrams and maps unknown tokens to the exported fallback", () => {
  const metadata = {
    dimensions: 2,
    tokens: ["AA", "AS", "SA"],
    unknown_index: 3,
  };
  const vectors = new Float32Array([
    1, 2,
    3, 4,
    5, 6,
    0, 0,
  ]);
  const candidates = [
    { window: `${"A".repeat(14)}S${"A".repeat(14)}` },
    { window: `${"A".repeat(14)}X${"A".repeat(14)}` },
  ];

  const batch = prediction.encodeWord2VecBatch(
    candidates,
    0,
    2,
    metadata,
    vectors,
  );

  assert.equal(batch.length, 112);
  assert.deepEqual(Array.from(batch.slice(13 * 2, 15 * 2)), [3, 4, 5, 6]);
  assert.deepEqual(
    Array.from(batch.slice(56 + 13 * 2, 56 + 15 * 2)),
    [0, 0, 0, 0],
  );
});

test("formats prediction scores with the Python three-decimal contract", () => {
  assert.equal(prediction.formatScore(0.5005), "0.500");
  assert.equal(prediction.formatScore(0.9515), "0.952");
  assert.equal(prediction.formatScore(0.9995), "1.000");
});
