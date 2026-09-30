import collections
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import build_atlas_enrichment as E

class EnrichmentTests(unittest.TestCase):
    def test_verified_publication_identity_and_plain_text(self):
        raw={'uid':'12345678','title':'A <i>protein</i> &amp; its role','authors':[{'name':'Li Y'}], 'pubdate':'2024 May','articleids':[{'idtype':'pubmed','value':'12345678'},{'idtype':'doi','value':'10.1234/a'}]}
        paper=E.publication('12345678',raw,'2026-09-30')
        self.assertEqual(paper['title'],'A protein & its role');self.assertEqual(paper['year'],'2024');self.assertEqual(paper['doi'],'10.1234/a')
        raw['articleids'][0]['value']='87654321';self.assertEqual(E.publication('12345678',raw,'')['status'],'identifier-mismatch')
        self.assertEqual(E.publication('55555555',raw,'')['status'],'unavailable')
        self.assertEqual(E.pmids([{'pmid':'12345678; 23456789'}]),['12345678','23456789'])

    def test_feature_boundaries_and_isoform_specific_coordinates(self):
        exact={'type':'Domain','description':'DNA binding','location':{'start':{'modifier':'EXACT','value':2},'end':{'modifier':'EXACT','value':5}}}
        uncertain=copy.deepcopy(exact);uncertain['location']['end']['modifier']='OUTSIDE'
        other_isoform=copy.deepcopy(exact);other_isoform['location']['sequence']='P12270-2'
        outside=copy.deepcopy(exact);outside['location']['end']['value']=11
        features,excluded=E.normalized_features({'sequence':{'value':'MSTAAAAAAAA'},'features':[exact,uncertain,other_isoform]})
        self.assertEqual(len(features),1);self.assertEqual(excluded,{'uncertain_boundary':1,'isoform_specific':1})
        self.assertFalse(E.normalized_features({'sequence':{'value':'MST'},'features':[outside]})[0])

    def test_peptide_audit_preserves_uncertain_cases(self):
        row={'id':'source-1','position_in_protein':2,'site_residue':'S','position_in_peptide':2,'peptide_seq':'ASA'}
        original=copy.deepcopy(row);audit=E.audit_sequence([row],'MKASAK','MKASAK')
        self.assertEqual(audit['mismatches'][0]['classification'],'consistent_peptide_candidate');self.assertEqual(audit['mismatches'][0]['candidate_positions'],[4]);self.assertEqual(row,original)
        self.assertEqual(E.row_alignment(row,'ASAKASA')['status'],'multiple_peptide_matches')
        self.assertEqual(E.row_alignment(row,'MKKK')['status'],'peptide_not_found')
        self.assertEqual(E.row_alignment({**row,'site_residue':'T'},'MKASAK')['status'],'peptide_residue_conflict')
        self.assertEqual(E.row_alignment({**row,'peptide_seq':'AS[mod]A'},'MKASAK')['status'],'insufficient_peptide')
        audit=E.audit_sequence([row,{**row,'id':'source-2','peptide_seq':''}],'MKASAK')
        self.assertEqual(audit['mismatches'][0]['classification'],'partial_peptide_support')

    def test_complete_cache_required(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(E,'CACHE',Path(temp)):
            with self.assertRaisesRegex(RuntimeError,'Incomplete metadata cache'):E.require_complete_cache([{'accession':'P12270','accession_source':'UniProt','pmid':'12345678'}])

    def test_canonical_features_never_assumed_for_alternative_isoform(self):
        rows=[{'id':1,'accession':'P12270-2','accession_source':'UniProt','pmid':'12345678'}]
        entry={'primaryAccession':'P12270','sequence':{'value':'MST'},'comments':[{'commentType':'ALTERNATIVE PRODUCTS','isoforms':[{'isoformIds':['P12270-2'],'isoformSequenceStatus':'Described'}]}],'features':[]}
        with tempfile.TemporaryDirectory() as temp, patch.object(E,'CACHE',Path(temp)):
            E.write_gzip(E.CACHE/'pubmed'/f'{E.digest("12345678")[:16]}.json.gz',{'retrieved_at':'2026-09-30','data':{'result':{}}})
            path=E.CACHE/'uniprot'/f'{E.digest("P12270"+E.FIELDS)[:16]}.json.gz'
            def write():E.write_gzip(path,{'headers':{'x-uniprot-release':'2026_03'},'retrieved_at':'2026-09-30','data':{'results':[entry]}})
            E.write_gzip(E.CACHE/'isoforms/P12270-2.json.gz',{'data':'>sp|P12270-2|TEST\nMST\n'})
            write();files,_=E.build(rows,{'sequences':{'P12270-2':'MST'}})
            key='proteins/'+E.accession_bucket('P12270-2')+'.json'
            self.assertEqual(files[key]['proteins']['P12270-2']['status'],'isoform_annotations_unavailable')
            entry['comments'][0]['isoforms'][0]['isoformSequenceStatus']='Displayed';write();files,_=E.build(rows,{'sequences':{'P12270-2':'MST'}})
            self.assertEqual(files[key]['proteins']['P12270-2']['status'],'verified')
            files,_=E.build(rows,{'sequences':{'P12270-2':'MAS'}});self.assertEqual(files[key]['proteins']['P12270-2']['status'],'sequence_mismatch')
            self.assertEqual(E.fasta_sequence('>sp|P12270|WRONG\nMST','P12270-2'),'')

    def test_entire_corpus_has_reproducible_coverage_and_all_1046_conflicts(self):
        rows=json.loads((E.DATA/'atlas-records.json').read_text());snapshot=json.loads((E.DATA/'atlas-sequences-v1.json').read_text())
        files,report=E.build(rows,snapshot)
        self.assertEqual(report['records'],61035);self.assertEqual(report['accessions'],8881);self.assertEqual(report['publication_statuses'],{'verified':427})
        self.assertEqual(report['mismatched_sites'],1046);self.assertEqual(report['mismatch_classifications'],{'consistent_peptide_candidate':459,'unresolved':504,'partial_peptide_support':83})
        self.assertEqual(report['original_source_values_changed'],0)
        checks=[item for a in files['mapping-audit.json']['accessions'].values() for item in a['mismatches']]
        self.assertEqual(len(checks),1046);self.assertTrue(all(len(item['checks'])==item['records'] for item in checks))
        for name,payload in files.items():self.assertEqual((E.OUTPUT/name).read_bytes(),E.encoded(payload),name)
        for name,payload in files.items():
            if name.startswith('proteins/'):
                for accession,item in payload['proteins'].items():
                    if item['status']=='verified':
                        self.assertEqual(item['snapshot_sha256'],item['source_sha256']);self.assertEqual(item['snapshot_length'],item['source_length'])
                        self.assertTrue(all(1<=f['start']<=f['end']<=item['snapshot_length'] for f in item['features']))

if __name__=='__main__':unittest.main()
