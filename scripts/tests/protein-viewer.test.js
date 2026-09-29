const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const viewer = require('../../public/static/js/protein-viewer.js');

test('protein coordinates reject partial, fractional, composite and unsafe source annotations', () => {
  for (const raw of ['', null, undefined, '12/13', 'T886', '1e2', '0x20', -1, 0, 1.5, 'Infinity', '9007199254740992']) assert.equal(viewer.position(raw), null, String(raw));
  assert.equal(viewer.position(' 0012 '), 12);
  assert.equal(viewer.position(1676), 1676);
});

test('protein summary preserves rows, ambiguous assignments, PMIDs and unmappable evidence', () => {
  const rows = [
    { position_in_protein:'2', site_residue:'S', ambiguous:'unambiguous', pmid:'12345678; 23456789' },
    { position_in_protein:'2', site_residue:'S', ambiguous:'ambiguous', pmid:'12345678' },
    { position_in_protein:'3', site_residue:'T', ambiguous:'not specified', pmid:'23456789' },
    { position_in_protein:'12/13', ambiguous:'ambiguous', pmid:'34567890' },
    { position_in_protein:'10', site_residue:'S', ambiguous:'unambiguous', pmid:'34567890' }
  ];
  const snapshot = JSON.stringify(rows), summary = viewer.summarize(rows, 'ASAS');
  assert.deepEqual(summary.sites.map(site=>site.position), [2,3,10]);
  assert.equal(summary.sites[0].records.length, 2);
  assert.equal(summary.sites[0].publications.length, 2);
  assert.deepEqual(summary.sites[0].assignments, {unambiguous:1,ambiguous:1,other:0});
  assert.equal(summary.sites[1].mismatch, true);
  assert.equal(summary.sites[1].assignments.other, 1);
  assert.equal(summary.sites[2].mapped, false);
  assert.equal(summary.unplaced, 1); assert.equal(summary.outside, 1);
  assert.equal(summary.publications.length, 3);
  assert.equal(JSON.stringify(rows), snapshot);
  const unavailable = viewer.summarize(rows);
  assert.equal(unavailable.sites.length, 3);
  assert.equal(unavailable.sites.some(site=>site.mapped), false);
  assert.equal(unavailable.outside, 0);
});

test('FASTA parsing never treats missing values or an error document as protein sequence', () => {
  assert.equal(viewer.sequenceFromFasta('>sp|P12270|TPR_HUMAN\r\nas \r\ntq\n'), 'ASTQ');
  for (const raw of ['', 'NA', '<html>error</html>', '>protein\n>second\nAS', '>protein\n123']) assert.equal(viewer.sequenceFromFasta(raw), '');
});

test('P12270 viewer aggregates its actual curated evidence without inferring additional sites', () => {
  const root = path.resolve(__dirname,'../..');
  const rows = JSON.parse(fs.readFileSync(path.join(root,'public/static/data/atlas-records.json'))).filter(row=>row.accession==='P12270');
  const sequence = JSON.parse(fs.readFileSync(path.join(root,'public/static/data/atlas-sequences-v1.json'))).sequences.P12270;
  const result = viewer.summarize(rows,sequence), site = result.sites.find(site=>site.position===1676);
  assert.equal(result.records.length,75); assert.equal(result.sites.length,27); assert.equal(result.publications.length,21);
  assert.equal(result.unplaced,0); assert.equal(result.outside,0); assert.equal(sequence.length,2363);
  assert.equal(site.residue,'S'); assert.equal(site.records.length,25); assert.equal(site.publications.length,17);
  assert.deepEqual(site.assignments,{unambiguous:23,ambiguous:2,other:0});
});
