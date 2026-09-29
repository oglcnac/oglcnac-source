const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PUBLIC = path.resolve(__dirname, '../../public');
const SOURCE = fs.readFileSync(path.join(PUBLIC, 'static/js/static-data.js'), 'utf8');
const DATA = '/static/data/atlas-v2/';
const assetCache = new Map();
const canonicalRecords = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'static/data/atlas-records.json')));
const canonicalSnapshot = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'static/data/atlas-sequences-v1.json')));
const plain = (value) => JSON.parse(JSON.stringify(value));

function bucketPath(accession) {
  let hash = 2166136261;
  for (const character of accession) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
  return `${DATA}records/${(hash & 255).toString(16).padStart(2, '0')}.json`;
}
function snapshotBucket(snapshot, records = {}) {
  return { json: { schema_version: 1, records, snapshot: {
    schema_version: 1, provenance: {}, coverage: {}, sequences: {}, missing_accessions: [],
    excluded_identifiers: { non_uniprot: [], unresolved: [], blank_accession_record_ids: [] }, ...snapshot
  } } };
}
function loadApi(responses) {
  const requests = [];
  const context = {
    console, encodeURIComponent,
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch: async (url) => {
      requests.push(url);
      const pathname = url.split('?')[0];
      const response = pathname === `${DATA}manifest.json`
        ? { json: { revision: 'fixture' } }
        : typeof responses === 'function' ? await responses(pathname) : responses[pathname];
      if (!response) throw new Error(`Unexpected request: ${url}`);
      return {
        ok: response.status === undefined || response.status < 400,
        async json() { if (response.jsonError) throw response.jsonError; return response.json; },
        async text() { return response.text || ''; }
      };
    },
    window: {}
  };
  vm.runInNewContext(SOURCE, context);
  return { api: context.window.OglcnacStaticData, requests };
}
function canonicalApi() {
  return loadApi((url) => {
    assert.ok(url.startsWith('/static/data/'), `unexpected external request ${url}`);
    if (!assetCache.has(url)) assetCache.set(url, JSON.parse(fs.readFileSync(path.join(PUBLIC, url))));
    return { json: assetCache.get(url) };
  });
}
function dataRequests(requests) { return requests.filter((url) => url !== `${DATA}manifest.json`).map((url) => url.split('?')[0]); }

test('selected Atlas sequence uses one small tracked bucket before UniProt', async () => {
  const url = bucketPath('P18583');
  const { api, requests } = loadApi({ [url]: snapshotBucket({ sequences: { P18583: 'MSTAA' } }) });
  assert.equal(await api.getAtlasProteinFasta('P18583'), '>local|P18583|O-GlcNAcAtlas sequence snapshot\nMSTAA');
  assert.deepEqual(dataRequests(requests), [url]);
  assert.ok(requests[1].endsWith('?v=fixture'));
});

test('sequence lookup falls back to UniProt only for explicitly missing tracked accessions', async () => {
  const url = bucketPath('Q22222');
  const remote = 'https://rest.uniprot.org/uniprotkb/Q22222.fasta';
  const { api, requests } = loadApi({ [url]: snapshotBucket({ missing_accessions: ['Q22222'] }), [remote]: { text: '>sp|Q22222|SECOND\nQQQ\n' } });
  assert.equal(await api.getAtlasProteinFasta('Q22222'), '>sp|Q22222|SECOND\nQQQ\n');
  assert.deepEqual(dataRequests(requests), [url, remote]);
});

test('missing UniProt response fails closed without inventing a sequence', async () => {
  const { api } = loadApi({ [bucketPath('Q33333')]: snapshotBucket({ missing_accessions: ['Q33333'] }), 'https://rest.uniprot.org/uniprotkb/Q33333.fasta': { status: 503 } });
  assert.equal(await api.getAtlasProteinFasta('Q33333'), '');
});

test('excluded and unknown identifiers never cause a UniProt request', async () => {
  for (const accession of ['AT1G01030', 'NOT-A-RECORD', '__proto__', '../escaped']) {
    const url = bucketPath(accession);
    const { api, requests } = loadApi({ [url]: snapshotBucket({}) });
    assert.equal(await api.getAtlasProteinFasta(accession), '');
    assert.deepEqual(dataRequests(requests), [url]);
  }
});

test('snapshot membership failures stay local and can recover without reload', async () => {
  let attempts = 0;
  const { api, requests } = loadApi(() => ++attempts === 1 ? { status: 503 } : snapshotBucket({ sequences: { P18583: 'MST' } }));
  assert.equal(await api.getAtlasProteinFasta('P18583'), '');
  assert.equal(await api.getAtlasProteinFasta('P18583'), '>local|P18583|O-GlcNAcAtlas sequence snapshot\nMST');
  assert.deepEqual(dataRequests(requests), [bucketPath('P18583'), bucketPath('P18583')]);
});

test('JSON cache evicts network, HTTP and parsing failures and deduplicates in-flight/successful loads', async () => {
  for (const failure of ['network', 'http', 'json']) {
    let attempts = 0;
    const { api } = loadApi(async () => {
      attempts++;
      if (attempts === 1) {
        if (failure === 'network') throw new Error('offline');
        if (failure === 'http') return { status: 503 };
        return { jsonError: new Error('invalid JSON') };
      }
      return { json: [{ uuid_b: 'P12345' }] };
    });
    const failures = await Promise.allSettled([api.loadOgtPinRecords(), api.loadOgtPinRecords()]);
    assert.ok(failures.every((result) => result.status === 'rejected'));
    assert.equal(attempts, 1);
    const [first, second] = await Promise.all([api.loadOgtPinRecords(), api.loadOgtPinRecords()]);
    assert.strictEqual(first, second);
    assert.equal(attempts, 2);
    await api.loadOgtPinRecords();
    assert.equal(attempts, 2);
  }
});

test('all metadata search fields preserve substring matching, source row order and exported values', async () => {
  const { api, requests } = canonicalApi();
  const queries = { accession: ['P18583', '-2', 'not-a-real-accession'], protein_name: ['rna', 'kinase'], gene_name: ['OGT', 'SON'], species: [' HUMAN ', 'Elegans'], 'unknown-field': ['P18583'] };
  for (const [field, terms] of Object.entries(queries)) for (const query of terms) {
    const actual = await api.searchAtlas(query, field);
    const sourceField = field === 'unknown-field' ? 'accession' : field;
    const expected = canonicalRecords.filter((record) => String(record[sourceField] || '').trim().toLowerCase().includes(query.trim().toLowerCase()));
    assert.deepEqual(plain(actual.map((row) => row.id)), expected.map((row) => row.id), `${field}: ${query}`);
    for (let i = 0; i < actual.length; i++) for (const key of ['accession', 'entry_name', 'protein_name', 'gene_name', 'species', 'position_in_protein']) assert.equal(actual[i][key], expected[i][key], `${field}/${query}: ${key}`);
  }
  assert.deepEqual(dataRequests(requests), [`${DATA}index.json`]);
});

test('browse preserves aliases, others membership, row counts, source order and filtering', async () => {
  const { api } = canonicalApi();
  for (const species of ['Human', 'Mouse', 'Rat', 'Drosophila', 'Arabidopsis', 'C. elegans', 'Caenorhabditis elegans', 'Others']) for (const query of ['', 'rna']) {
    const actual = await api.browseAtlas(species, query);
    const wanted = species.toLowerCase();
    const expected = canonicalRecords.filter((record) => {
      if (!record.accession) return false;
      const actualSpecies = String(record.species || '').trim().toLowerCase();
      const speciesMatch = ['c. elegans', 'caenorhabditis elegans'].includes(wanted)
        ? ['c. elegans', 'caenorhabditis elegans'].includes(actualSpecies)
        : wanted === 'others' ? !['human', 'mouse', 'rat', 'drosophila', 'arabidopsis', 'c. elegans', 'caenorhabditis elegans'].includes(actualSpecies) : wanted === actualSpecies;
      return speciesMatch && (!query || ['accession', 'entry_name', 'protein_name', 'gene_name', 'position_in_protein'].some((key) => String(record[key] || '').trim().toLowerCase().includes(query)));
    });
    assert.deepEqual(plain(actual.map((record) => record.id)), expected.map((record) => record.id), `${species}/${query}`);
  }
});

test('peptide search is exact for narrow, broad, case-insensitive and no-match substrings', async () => {
  for (const query of [canonicalRecords.find((record) => record.peptide_seq?.length > 10).peptide_seq.toLowerCase(), 'S', 'not-a-peptide']) {
    const { api } = canonicalApi();
    const actual = await api.searchAtlas(query, 'peptide_seq');
    const expected = canonicalRecords.filter((record) => String(record.peptide_seq || '').trim().toLowerCase().includes(query.trim().toLowerCase()));
    assert.deepEqual(plain(actual.map((record) => [record.id, record.peptide_seq])), expected.map((record) => [record.id, record.peptide_seq]));
  }
});

test('scoped evidence retains every original field, exact isoforms, row order and snapshot provenance', async () => {
  const { api, requests } = canonicalApi();
  const accessions = ['P18583', 'Q96EH5', 'P05067', 'P05067-2', 'AT1G01030', 'NOT-A-RECORD', 'P18583'];
  assert.deepEqual(plain(await api.loadAtlasRecordsForAccessions(accessions)), canonicalRecords.filter((record) => accessions.includes(record.accession)));
  const detail = await api.getAtlasDetail('P18583');
  assert.deepEqual(plain(detail.records), canonicalRecords.filter((record) => record.accession === 'P18583'));
  assert.equal(detail.count, detail.records.length);
  assert.equal(new Set(detail.positions).size, detail.positions.length);
  const snapshot = await api.loadAtlasSequenceSnapshotForAccessions(accessions);
  assert.deepEqual(plain(snapshot.sequences), Object.fromEntries(Object.entries(canonicalSnapshot.sequences).filter(([accession]) => accessions.includes(accession))));
  assert.deepEqual(plain(snapshot.provenance), canonicalSnapshot.provenance);
  assert.deepEqual(plain(snapshot.coverage), canonicalSnapshot.coverage);
  assert.equal(dataRequests(requests).length, new Set(accessions.map(bucketPath)).size);
  assert.ok(dataRequests(requests).every((url) => url.startsWith(`${DATA}records/`)));
});

test('sequence positions never parse a numeric prefix from a mixed source annotation', async () => {
  const records = ['', null, '0', '-1', '2S4', '12/13', 'T886', '14', 16, '14'].map(position_in_protein => ({ accession: 'P18583', position_in_protein }));
  const { api } = loadApi({ [bucketPath('P18583')]: snapshotBucket({}, { P18583: records.map((record, index) => [index, record]) }) });
  const detail = await api.getAtlasDetail('P18583');
  assert.deepEqual(plain(detail.positions), [14, 16]);
  assert.deepEqual(plain(detail.records), records);
});

test('representative browse, accession search, peptide search and detail stay below gzip data budget', async () => {
  for (const operation of [
    (api) => api.browseAtlas('Human', ''),
    (api) => api.searchAtlas('P18583', 'accession'),
    (api) => api.searchAtlas(canonicalRecords.find((record) => record.peptide_seq?.length > 10).peptide_seq, 'peptide_seq'),
    (api) => Promise.all([api.getAtlasDetail('P18583'), api.getAtlasProteinFasta('P18583')])
  ]) {
    const { api, requests } = canonicalApi();
    await operation(api);
    const bytes = requests.reduce((sum, url) => sum + fs.statSync(path.join(PUBLIC, `${url.split('?')[0]}.gz`)).size, 0);
    assert.ok(bytes <= 480000, `Allow 20 KB for shell resources; data was ${bytes} gzip bytes`);
    assert.ok(!requests.some((url) => url.endsWith('/atlas-records.json') || url.endsWith('/atlas-sequences-v1.json')));
  }
});
