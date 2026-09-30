#!/usr/bin/env python3
"""Deterministic discovery indexes and provenance; never modifies source evidence."""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from scripts.build_atlas_delivery import encoded, compressed

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/static/data'


def build(data=DATA):
    records = json.loads((data / 'atlas-records.json').read_text())
    papers = json.loads((data / 'atlas-enrichment/publications.json').read_text())['publications']
    proteins, studies = defaultdict(list), defaultdict(list)
    for row in records:
        if row.get('accession'):
            proteins[row['accession']].append(row)
        for pmid in set(re.findall(r'\b\d{6,9}\b', str(row.get('pmid') or ''))):
            studies[pmid].append(row)
    def values(rows, field):
        return sorted({str(row.get(field) or '').strip() for row in rows} - {''})
    suggestions = [{'accession': accession, 'genes': values(rows, 'gene_name'),
                    'names': values(rows, 'protein_name'), 'species': values(rows, 'species')}
                   for accession, rows in sorted(proteins.items())]
    directory = []
    for pmid, rows in sorted(studies.items()):
        paper = papers.get(pmid, {'pmid': pmid, 'status': 'unavailable'})
        coordinates = {(r.get('accession'), r.get('species'), int(str(r['position_in_protein']).strip()))
                       for r in rows if r.get('accession') and re.fullmatch(r'\d+', str(r.get('position_in_protein') or '').strip())
                       and int(str(r['position_in_protein']).strip()) > 0}
        directory.append({'pmid': pmid, 'paper': paper, 'records': len(rows),
                          'proteins': len(values(rows, 'accession')), 'positions': len(coordinates),
                          'species': values(rows, 'species')})
    sources = {}
    for name in ['atlas-records.json', 'atlas-sequences-v1.json', 'ogt-pin-records.json',
                 'atlas-enrichment/publications.json', 'atlas-enrichment/manifest.json',
                 'atlas-v2/manifest.json', 'atlas-release-v1.json']:
        body = (data / name).read_bytes()
        sources[name] = {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}
    sources['prediction-model-manifest'] = {'sha256': hashlib.sha256((data.parent / 'prediction/v1/manifest.json').read_bytes()).hexdigest(),
                                          'path': '/static/prediction/v1/manifest.json'}
    release = json.loads((data / 'atlas-release-v1.json').read_text())['release']
    provenance = {'schema_version': 1, 'atlas_release': release['name'].removeprefix('O-GlcNAcAtlas '), 'sources': sources,
                  'atlas_release_metadata': release,
                  'sequence_snapshot_provenance': json.loads((data / 'atlas-sequences-v1.json').read_text())['provenance'],
                  'delivery': json.loads((data / 'atlas-v2/manifest.json').read_text()),
                  'enrichment': json.loads((data / 'atlas-enrichment/manifest.json').read_text()),
                  'record_count': len(records), 'protein_count': len(proteins), 'study_count': len(studies),
                  'records_without_pmid': sum(not re.search(r'\b\d{6,9}\b', str(r.get('pmid') or '')) for r in records)}
    payloads = {'proteins.json': {'schema_version': 1, 'proteins': suggestions},
                'studies.json': {'schema_version': 1, 'studies': directory}}
    for name, payload in payloads.items():
        sources[name] = {'sha256': hashlib.sha256(encoded(payload)).hexdigest()}
    provenance['revision'] = hashlib.sha256(encoded(provenance)).hexdigest()[:16]
    payloads['manifest.json'] = provenance
    return payloads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    directory = DATA / 'atlas-research'
    for name, payload in build().items():
        body = encoded(payload)
        for suffix, content in [('', body), ('.gz', compressed(body))]:
            path = directory / (name + suffix)
            if args.check:
                if not path.exists() or path.read_bytes() != content:
                    raise SystemExit(f'Research catalog is stale: {path}')
            else:
                directory.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
    print('Research discovery catalogs and provenance verified.' if args.check else 'Research discovery catalogs generated.')


if __name__ == '__main__':
    main()
