#!/usr/bin/env python3
"""Refresh authoritative metadata explicitly, or rebuild/check offline Atlas enrichment."""
from __future__ import annotations
import argparse, collections, datetime, gzip, hashlib, html, json, re, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from scripts.build_atlas_delivery import accession_bucket, compressed, encoded

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/atlas-enrichment'
DATA = ROOT / 'public/static/data'
OUTPUT = DATA / 'atlas-enrichment'
UNIPROT = re.compile(r'(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[1-9][0-9]*)?\Z')
FIELDS = 'accession,id,sequence,ft_domain,ft_region,ft_coiled,ft_repeat,version,sequence_version,date_modified,date_sequence_modified,organism_id,cc_alternative_products'
FEATURE_TYPES = {'Domain', 'Region', 'Coiled coil', 'Repeat'}


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def numeric(value):
    raw = str(value or '').strip()
    return int(raw) if re.fullmatch(r'[0-9]+', raw) and 0 < int(raw) <= 9007199254740991 else None


def pmids(rows):
    return sorted({p for row in rows for p in re.findall(r'\b[0-9]{6,9}\b', str(row.get('pmid') or ''))}, key=int)


def read_gzip(path):
    return json.loads(gzip.decompress(path.read_bytes()))


def write_gzip(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(compressed(encoded(payload)))


def retrieve(url, path, *, text=False):
    if path.exists():
        return read_gzip(path)
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'OGlcNAcAtlas-metadata/1.0', 'Accept': 'text/plain' if text else 'application/json'})
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode('utf-8')
                payload = {'url': url, 'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                           'headers': {k.lower(): v for k,v in response.headers.items() if k.lower().startswith('x-uniprot')},
                           'data': body if text else json.loads(body)}
            write_gzip(path, payload)
            time.sleep(.4)
            return payload
        except urllib.error.HTTPError as error:
            if error.code in (400,404,410):
                payload = {'url': url, 'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'headers': {}, 'error_status': error.code, 'data': '' if text else {}}
                write_gzip(path, payload)
                return payload
            if attempt == 4: raise
            time.sleep(min(20, 2 ** (attempt+1)))
        except (OSError, ValueError):
            if attempt == 4: raise
            time.sleep(min(20, 2 ** (attempt+1)))
    raise RuntimeError('Metadata retrieval did not complete')


def refresh(rows):
    identifiers = pmids(rows)
    for start in range(0, len(identifiers), 100):
        batch = identifiers[start:start+100]
        query = urllib.parse.urlencode({'db':'pubmed','id':','.join(batch),'retmode':'json','tool':'OGlcNAcAtlas'})
        path = CACHE/'pubmed'/f'{digest(",".join(batch))[:16]}.json.gz'
        payload = retrieve('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?'+query, path)
        result = payload['data'].get('result', {})
        if not result: raise RuntimeError(f'No PubMed result for batch {start}: {payload.get("error_status",payload["data"])}')
        print(f'PubMed {min(start+100,len(identifiers))}/{len(identifiers)}', flush=True)
    accessions = sorted({str(row.get('accession') or '') for row in rows if str(row.get('accession_source','')).lower()=='uniprot' and UNIPROT.fullmatch(str(row.get('accession') or ''))})
    canonical = sorted({value.split('-')[0] for value in accessions})
    for start in range(0, len(canonical), 100):
        batch = canonical[start:start+100]
        query = urllib.parse.urlencode({'query':' OR '.join('accession:'+value for value in batch),'format':'json','size':500,'fields':FIELDS})
        path = CACHE/'uniprot'/f'{digest(",".join(batch)+FIELDS)[:16]}.json.gz'
        payload = retrieve('https://rest.uniprot.org/uniprotkb/search?'+query,path)
        if 'results' not in payload['data']:raise RuntimeError(f'No UniProt result for batch {start}: {payload}')
        if len(payload['data']['results'])>=500:raise RuntimeError('UniProt response requires pagination; refuse a truncated cache')
        print(f'UniProt {min(start+100,len(canonical))}/{len(canonical)}',flush=True)
    isoforms=[a for a in accessions if '-' in a]
    for index, accession in enumerate(isoforms):
        retrieve('https://rest.uniprot.org/uniprotkb/'+accession+'.fasta',CACHE/'isoforms'/f'{accession}.json.gz',text=True)
        if index%10==0 or index==len(isoforms)-1:print(f'Isoforms {index+1}/{len(isoforms)}',flush=True)


def plain(value):
    return html.unescape(re.sub(r'<[^>]*>','',str(value or ''))).strip()


def publication(uid, raw, retrieved):
    if str(raw.get('uid'))!=uid or not raw.get('title') or raw.get('error'):
        return {'pmid':uid,'status':'unavailable','retrieved':retrieved}
    article_ids={item.get('idtype'):str(item.get('value','')) for item in raw.get('articleids',[])}
    if article_ids.get('pubmed') != uid:
        return {'pmid':uid,'status':'identifier-mismatch','retrieved':retrieved}
    doi=article_ids.get('doi','')
    if not re.fullmatch(r'10\.[0-9]{4,9}/\S+',doi):doi=''
    return {'pmid':uid,'status':'verified','title':plain(raw['title']),
            'authors':[plain(a.get('name')) for a in raw.get('authors',[]) if a.get('name')],
            'journal':plain(raw.get('fulljournalname') or raw.get('source')),'journal_short':plain(raw.get('source')),
            'date':plain(raw.get('pubdate') or raw.get('epubdate')),'year':(re.findall(r'\b(?:19|20)[0-9]{2}\b',str(raw.get('pubdate','')))+[''])[0],
            'volume':plain(raw.get('volume')),'issue':plain(raw.get('issue')),'pages':plain(raw.get('pages')),
            'doi':doi,'retrieved':retrieved}


def fasta_sequence(text, accession):
    lines=str(text).strip().splitlines()
    if not lines or not re.match(r'^>(?:sp|tr)\|'+re.escape(accession)+r'\|',lines[0]):return ''
    sequence=''.join(lines[1:]).upper()
    return sequence if re.fullmatch(r'[A-Z]+',sequence) else ''


def normalized_features(entry):
    valid=[];excluded=collections.Counter()
    length=len(entry.get('sequence',{}).get('value',''))
    for feature in entry.get('features',[]):
        if feature.get('type') not in FEATURE_TYPES:continue
        location=feature.get('location',{});start=location.get('start',{});end=location.get('end',{})
        if location.get('sequence'):excluded['isoform_specific']+=1;continue
        if start.get('modifier')!='EXACT' or end.get('modifier')!='EXACT':excluded['uncertain_boundary']+=1;continue
        first=numeric(start.get('value'));last=numeric(end.get('value'))
        if first is None or last is None or first>last or last>length:excluded['invalid_boundary']+=1;continue
        evidence=[{'code':str(item.get('evidenceCode','')),'source':str(item.get('source','')),'id':str(item.get('id',''))} for item in feature.get('evidences',[])]
        valid.append({'type':feature['type'],'start':first,'end':last,'description':plain(feature.get('description')) or feature['type'],'evidence':evidence})
    valid.sort(key=lambda feature:(feature['start'],feature['end'],feature['type'],feature['description']))
    return valid,dict(excluded)


def row_alignment(row, sequence):
    peptide=str(row.get('peptide_seq') or '').strip().upper();offset=numeric(row.get('position_in_peptide'))
    residue=str(row.get('site_residue') or '').strip().upper()
    if not sequence or not re.fullmatch('[A-Z]+',peptide) or not offset or offset>len(peptide):return {'status':'insufficient_peptide'}
    if len(residue)!=1 or peptide[offset-1]!=residue:return {'status':'peptide_residue_conflict'}
    locations=[];start=sequence.find(peptide)
    while start>=0 and len(locations)<3:
        locations.append(start+offset);start=sequence.find(peptide,start+1)
    if not locations:return {'status':'peptide_not_found'}
    if len(locations)>1:return {'status':'multiple_peptide_matches'}
    return {'status':'unique_peptide_match','candidate':locations[0]}


def audit_sequence(rows, sequence, current=''):
    groups=collections.defaultdict(list);unplaced=0
    for row in rows:
        pos=numeric(row.get('position_in_protein'))
        if pos is None:unplaced+=1
        else:groups[pos].append(row)
    mismatches=[];outside=[]
    for pos,group in sorted(groups.items()):
        if not sequence:continue
        if pos>len(sequence):outside.append({'position':pos,'records':len(group)});continue
        observed=sequence[pos-1]
        conflicts=[r for r in group if re.fullmatch('[A-Za-z]',str(r.get('site_residue') or '').strip()) and str(r['site_residue']).strip().upper()!=observed]
        if not conflicts:continue
        checks=[]
        for row in conflicts:
            local=row_alignment(row,sequence);remote=row_alignment(row,current)
            checks.append({'record_id':row['id'],'reported_residue':str(row['site_residue']).strip(),'snapshot_peptide':local,'current_peptide':remote})
        candidates=sorted({c['snapshot_peptide']['candidate'] for c in checks if c['snapshot_peptide']['status']=='unique_peptide_match'})
        complete=all(c['snapshot_peptide']['status']=='unique_peptide_match' for c in checks)
        category='consistent_peptide_candidate' if complete and len(candidates)==1 else 'partial_peptide_support' if candidates else 'unresolved'
        reported=sorted({str(row['site_residue']).strip().upper() for row in conflicts})
        current_residue=current[pos-1] if current and pos<=len(current) else ''
        mismatches.append({'position':pos,'snapshot_residue':observed,'reported_residues':reported,'records':len(conflicts),
                           'current_residue':current_residue,'current_residue_matches':bool(current_residue and all(r==current_residue for r in reported)),
                           'classification':category,'candidate_positions':candidates,'checks':checks})
    return {'unplaced_records':unplaced,'outside_sequence':outside,'mismatches':mismatches}


def require_complete_cache(rows):
    identifiers = pmids(rows)
    expected = [CACHE/'pubmed'/f'{digest(",".join(identifiers[start:start+100]))[:16]}.json.gz' for start in range(0,len(identifiers),100)]
    accessions = sorted({str(r.get('accession') or '') for r in rows if str(r.get('accession_source','')).lower()=='uniprot' and UNIPROT.fullmatch(str(r.get('accession') or ''))})
    canonical = sorted({a.split('-')[0] for a in accessions})
    expected += [CACHE/'uniprot'/f'{digest(",".join(canonical[start:start+100])+FIELDS)[:16]}.json.gz' for start in range(0,len(canonical),100)]
    expected += [CACHE/'isoforms'/f'{a}.json.gz' for a in accessions if '-' in a]
    missing = [str(path) for path in expected if not path.is_file()]
    if missing: raise RuntimeError('Incomplete metadata cache; run --refresh: ' + ', '.join(missing))


def build(rows, snapshot):
    require_complete_cache(rows)
    source_pmids=pmids(rows);papers={};entries={};retrieved={};releases=set()
    for path in sorted((CACHE/'pubmed').glob('*.json.gz')):
        payload=read_gzip(path)
        for uid,record in payload['data'].get('result',{}).items():
            if uid!='uids' and uid in source_pmids:papers[uid]=publication(uid,record,payload['retrieved_at'][:10])
    for uid in source_pmids:papers.setdefault(uid,{'pmid':uid,'status':'unavailable'})
    for path in sorted((CACHE/'uniprot').glob('*.json.gz')):
        payload=read_gzip(path);release=payload['headers'].get('x-uniprot-release','')
        if release:releases.add(release)
        for entry in payload['data'].get('results',[]):
            accession=entry['primaryAccession'];entries[accession]=entry
            retrieved[accession]={'date':payload['retrieved_at'][:10],'release':release,'release_date':payload['headers'].get('x-uniprot-release-date','')}
    if len(releases)!=1:raise RuntimeError(f'Mixed UniProt releases: {releases}; refresh the entire cache')
    grouped=collections.defaultdict(list)
    for row in rows:grouped[str(row.get('accession') or '')].append(row)
    proteins={};audits={};counts=collections.Counter();mismatch_categories=collections.Counter();all_mismatch_count=0
    for accession,records in sorted(grouped.items()):
        sequence=snapshot.get('sequences',{}).get(accession,'')
        declared=any(str(r.get('accession_source','')).lower()=='uniprot' for r in records)
        canonical=accession.split('-')[0];entry=entries.get(canonical) if declared and UNIPROT.fullmatch(accession) else None
        item={'accession':accession,'status':'not_uniprot' if not declared or not UNIPROT.fullmatch(accession) else 'entry_unavailable','features':[],
              'snapshot_sha256':digest(sequence) if sequence else '', 'snapshot_length':len(sequence)}
        current=''
        if entry:
            current=entry.get('sequence',{}).get('value','')
            is_isoform='-' in accession;displayed=not is_isoform
            if is_isoform:
                iso_path=CACHE/'isoforms'/f'{accession}.json.gz'
                iso_payload=read_gzip(iso_path) if iso_path.exists() else {'data':''}
                current=fasta_sequence(iso_payload['data'],accession)
                displayed=any(accession in form.get('isoformIds',[]) and form.get('isoformSequenceStatus')=='Displayed'
                              for comment in entry.get('comments',[]) if comment.get('commentType')=='ALTERNATIVE PRODUCTS' for form in comment.get('isoforms',[]))
            item.update({'primary_accession':canonical,'source':'UniProt','retrieved':retrieved[canonical]['date'],'release':retrieved[canonical]['release'],
                         'entry_version':entry.get('entryAudit',{}).get('entryVersion'),'sequence_version':entry.get('entryAudit',{}).get('sequenceVersion'),
                         'sequence_modified':entry.get('entryAudit',{}).get('lastSequenceUpdateDate'),'entry_modified':entry.get('entryAudit',{}).get('lastAnnotationUpdateDate'),
                         'source_sha256':digest(current) if current else '','source_length':len(current),'taxon_id':entry.get('organism',{}).get('taxonId')})
            if not sequence:item['status']='snapshot_unavailable'
            elif not current:item['status']='source_sequence_unavailable'
            elif sequence!=current:item['status']='sequence_mismatch'
            elif is_isoform and (not displayed or current!=entry.get('sequence',{}).get('value','')):item['status']='isoform_annotations_unavailable'
            else:
                item['status']='verified'
                item['features'],item['excluded_features']=normalized_features(entry)
        audit=audit_sequence(records,sequence,current)
        item['sequence_audit']={key:value for key,value in audit.items() if key!='mismatches'}
        item['sequence_audit']['mismatches']=[{k:v for k,v in row.items() if k!='checks'} for row in audit['mismatches']]
        if audit['mismatches'] or audit['outside_sequence']:audits[accession]=audit
        all_mismatch_count+=len(audit['mismatches']);mismatch_categories.update(row['classification'] for row in audit['mismatches'])
        proteins[accession]=item;counts[item['status']]+=1
    inputs={'atlas_records_sha256':digest((DATA/'atlas-records.json').read_bytes()),'atlas_sequences_sha256':digest((DATA/'atlas-sequences-v1.json').read_bytes())}
    pub_payload={'schema_version':1,'source':'PubMed ESummary','publications':papers}
    buckets={f'{i:02x}':{} for i in range(256)}
    for accession,item in proteins.items():buckets[accession_bucket(accession)][accession]=item
    report={'schema_version':1,'inputs':inputs,'records':len(rows),'accessions':len(proteins),'pubmed_ids':len(source_pmids),
            'publication_statuses':dict(collections.Counter(p['status'] for p in papers.values())), 'protein_statuses':dict(counts),
            'uniprot_release':next(iter(releases)),'snapshot_provenance':snapshot.get('provenance',{}),
            'verified_feature_count':sum(len(item['features']) for item in proteins.values()),
            'mismatched_sites':all_mismatch_count,'mismatch_classifications':dict(mismatch_categories),
            'mismatch_current_residue_matches':sum(row['current_residue_matches'] for audit in audits.values() for row in audit['mismatches']),
            'original_source_values_changed':0}
    files={'publications.json':pub_payload,**{f'proteins/{key}.json':{'schema_version':1,'proteins':values} for key,values in buckets.items()},
           'mapping-audit.json':{'summary':report,'accessions':audits}}
    revision=digest(b''.join(encoded(files[name]) for name in sorted(files)))[:16]
    files['manifest.json']={'schema_version':1,'revision':revision,'uniprot_release':next(iter(releases)),'publication_count':len(papers),'protein_count':len(proteins)}
    return files,report


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--refresh',action='store_true',help='Explicitly retrieve/cache PubMed and UniProt responses; existing cached requests are reused.')
    parser.add_argument('--check',action='store_true');args=parser.parse_args()
    rows=json.loads((DATA/'atlas-records.json').read_text());snapshot=json.loads((DATA/'atlas-sequences-v1.json').read_text())
    if args.refresh:refresh(rows)
    files,report=build(rows,snapshot);expected=set();errors=[]
    for name,payload in files.items():
        body=encoded(payload)
        for suffix,data in [('',body),('.gz',compressed(body))]:
            target=OUTPUT/(name+suffix);expected.add(target)
            if args.check:
                if not target.exists() or target.read_bytes()!=data:errors.append(f'Stale enrichment asset: {target}')
            else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    for path in OUTPUT.rglob('*'):
        if path.is_file() and path not in expected:errors.append(f'Unexpected enrichment file: {path}')
    report_path=CACHE/'coverage.json';report_body=json.dumps(report,indent=2,ensure_ascii=False)+'\n'
    if args.check:
        if not report_path.exists() or report_path.read_text()!=report_body:errors.append('Stale enrichment coverage report')
    else:report_path.write_text(report_body)
    if errors:raise RuntimeError('\n'.join(errors))
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
