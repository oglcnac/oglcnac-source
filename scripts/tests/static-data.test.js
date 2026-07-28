const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../frontend/static/js/static-data.js"),
  "utf8",
);

function loadApi(responses) {
  const requests = [];
  const context = {
    console,
    encodeURIComponent,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    fetch: async (url) => {
      requests.push(url);
      const response = responses[url];
      if (!response) throw new Error(`Unexpected request: ${url}`);
      return {
        ok: response.status === undefined || response.status < 400,
        async json() {
          return response.json;
        },
        async text() {
          return response.text || "";
        },
      };
    },
    window: {},
  };
  vm.runInNewContext(SOURCE, context);
  return { api: context.window.OglcnacStaticData, requests };
}

test("Atlas sequence lookup uses the tracked snapshot before UniProt", async () => {
  const { api, requests } = loadApi({
    "/static/data/atlas-sequences-v1.json": {
      json: {
        schema_version: 1,
        coverage: {
          candidate_accessions: 1,
          resolved_accessions: 1,
          missing_accessions: 0,
          non_uniprot_identifiers: 0,
          unresolved_identifiers: 0,
          blank_accession_records: 0,
        },
        missing_accessions: [],
        excluded_identifiers: {
          non_uniprot: [],
          unresolved: [],
          blank_accession_record_ids: [],
        },
        sequences: { P18583: "MSTAA" },
      },
    },
  });

  const fasta = await api.getAtlasProteinFasta("P18583");

  assert.equal(fasta, ">local|P18583|O-GlcNAcAtlas sequence snapshot\nMSTAA");
  assert.deepEqual(requests, ["/static/data/atlas-sequences-v1.json"]);
});

test("Atlas sequence lookup falls back to UniProt only when local data is missing", async () => {
  const { api, requests } = loadApi({
    "/static/data/atlas-sequences-v1.json": {
      json: {
        schema_version: 1,
        coverage: {
          candidate_accessions: 1,
          resolved_accessions: 0,
          missing_accessions: 1,
          non_uniprot_identifiers: 0,
          unresolved_identifiers: 0,
          blank_accession_records: 0,
        },
        missing_accessions: ["Q22222"],
        excluded_identifiers: {
          non_uniprot: [],
          unresolved: [],
          blank_accession_record_ids: [],
        },
        sequences: {},
      },
    },
    "https://rest.uniprot.org/uniprotkb/Q22222.fasta": {
      text: ">sp|Q22222|SECOND\nQQQ\n",
    },
  });

  const fasta = await api.getAtlasProteinFasta("Q22222");

  assert.equal(fasta, ">sp|Q22222|SECOND\nQQQ\n");
  assert.deepEqual(requests, [
    "/static/data/atlas-sequences-v1.json",
    "https://rest.uniprot.org/uniprotkb/Q22222.fasta",
  ]);
});

test("Atlas sequence lookup returns empty data when local and UniProt fail", async () => {
  const { api } = loadApi({
    "/static/data/atlas-sequences-v1.json": {
      json: {
        schema_version: 1,
        coverage: {
          candidate_accessions: 1,
          resolved_accessions: 0,
          missing_accessions: 1,
          non_uniprot_identifiers: 0,
          unresolved_identifiers: 0,
          blank_accession_records: 0,
        },
        missing_accessions: ["Q33333"],
        excluded_identifiers: {
          non_uniprot: [],
          unresolved: [],
          blank_accession_record_ids: [],
        },
        sequences: {},
      },
    },
    "https://rest.uniprot.org/uniprotkb/Q33333.fasta": { status: 503 },
  });

  assert.equal(await api.getAtlasProteinFasta("Q33333"), "");
});

test("Atlas sequence lookup never sends excluded non-UniProt identifiers to UniProt", async () => {
  const { api, requests } = loadApi({
    "/static/data/atlas-sequences-v1.json": {
      json: {
        schema_version: 1,
        coverage: {
          candidate_accessions: 0,
          resolved_accessions: 0,
          missing_accessions: 0,
          non_uniprot_identifiers: 1,
          unresolved_identifiers: 0,
          blank_accession_records: 0,
        },
        missing_accessions: [],
        excluded_identifiers: {
          non_uniprot: ["AT1G01030"],
          unresolved: [],
          blank_accession_record_ids: [],
        },
        sequences: {},
      },
    },
  });

  assert.equal(await api.getAtlasProteinFasta("AT1G01030"), "");
  assert.deepEqual(requests, ["/static/data/atlas-sequences-v1.json"]);
});

test("Atlas sequence lookup fails closed when snapshot membership cannot be loaded", async () => {
  const { api, requests } = loadApi({
    "/static/data/atlas-sequences-v1.json": { status: 503 },
  });

  assert.equal(await api.getAtlasProteinFasta("AT1G01030"), "");
  assert.deepEqual(requests, ["/static/data/atlas-sequences-v1.json"]);
});
