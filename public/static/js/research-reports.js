(function(root){
  'use strict';
  const R=root.OglcnacResearch;
  const pretty=value=>JSON.stringify(value,null,2);
  async function provenance(){const [manifest,delivery]=await Promise.all([R.json('/static/data/atlas-research/manifest.json'),root.OglcnacStaticData.loadAtlasDeliveryManifest()]);if(manifest.delivery.revision!==delivery.revision)throw Error('Provenance and Atlas evidence belong to different releases. Reload before exporting.');return manifest;}
  async function citations(records){try{const papers=await root.OglcnacAtlasEvidence.loadPublications();return {status:'available',publications:Object.fromEntries(R.pmids(records).map(id=>[id,papers[id]||{pmid:id,status:'unavailable'}]))};}catch(_){return {status:'metadata unavailable',publications:Object.fromEntries(R.pmids(records).map(id=>[id,{pmid:id,status:'unavailable'}]))};}}
  async function protein(context){
    const manifest=await provenance(),papers=await citations(context.allRecords),sequenceHash=context.sequence?await R.sha256(context.sequence):null;
    const files={'source-evidence.json':pretty(context.allRecords),'source-evidence.csv':R.csv(context.allRecords),'filtered-evidence.json':pretty(context.filteredRecords),'filtered-evidence.csv':R.csv(context.filteredRecords),'parameters.json':pretty({filters:context.filters,selected_position:context.position,source_url:context.url}),'citations.json':pretty(papers),'dataset-manifest.json':pretty(manifest),'annotations.json':pretty(context.annotation)};
    if(context.sequence)files['sequence.fasta']=context.sequence_source?.kind==='uniprot-fallback'&&context.fasta?context.fasta.trim()+'\n':R.fasta([{accession:context.accession,sequence:context.sequence}]);
    return R.report({kind:'atlas-protein',metadata:{accession:context.accession,source_url:context.url,dataset_revision:manifest.revision,scope:{complete_records:context.allRecords.length,filtered_records:context.filteredRecords.length,filters:context.filters,selected_position:context.position},sequence:{available:!!context.sequence,sha256:sequenceHash,source:context.sequence_source},annotations:context.annotation.state,citation_metadata:papers.status,model:'Not applicable: experimental Atlas records'},files});
  }
  async function captureWorkbench({records,atlas,ogtPin,model,modelText,snapshot,fasta,species,started_at,preparation}){
    const accessions=new Set(records.map(record=>root.OglcnacWorkbenchCore.uniprotAccession(record.id)).filter(Boolean));
    const selectedOgt=ogtPin.filter(r=>accessions.has(String(r.uuid_b||'').toUpperCase()));
    const [source,papers]=await Promise.allSettled([provenance(),citations([...atlas,...selectedOgt])]);
    let error=source.status==='rejected'?source.reason.message:'';const manifest=source.status==='fulfilled'?source.value:null;
    if(manifest&&await R.sha256(modelText)!==manifest.sources['prediction-model-manifest'].sha256)error='The prediction model and provenance manifest belong to different releases. Rerun after reloading before exporting a report.';
    return {records,atlas,ogtPin:selectedOgt,model,snapshot,fasta,species,started_at,completed_at:new Date().toISOString(),preparation:preparation?JSON.parse(JSON.stringify(preparation)):null,manifest,error,citations:papers.status==='fulfilled'?papers.value:{status:'metadata unavailable',publications:{}}};
  }
  async function workbench(run,rows,filtered,filters){
    if(run.error||!run.manifest)throw Error(run.error||'Essential provenance was unavailable for this run. Rerun the analysis before exporting.');
    const sequences=[];for(const record of run.records)sequences.push({id:record.id,length:record.sequence.length,sha256:await R.sha256(record.sequence)});
    const files={'input.fasta':run.fasta,'results.json':pretty(rows),'results.csv':root.OglcnacWorkbenchCore.toCsv(rows),'filtered-results.json':pretty(filtered),'filtered-results.csv':root.OglcnacWorkbenchCore.toCsv(filtered),'atlas-source-evidence.json':pretty(run.atlas),'ogt-source-evidence.json':pretty(run.ogtPin),'citations.json':pretty(run.citations),'dataset-manifest.json':pretty(run.manifest),'model-manifest.json':pretty(run.model),'parameters.json':pretty({species_model:run.species,filters,preparation_context:run.preparation,preparation_note:"Preparation records the original Atlas choices. input.fasta and input_records capture the actual submitted input, including any edits.",input_records:sequences,coordinate_system:'1-based',sequence_verification:'Exact sequence comparison against the tracked Atlas snapshot; mismatches suppress Atlas and OGT-PIN matching.'}),'sequence-snapshot.json':pretty(run.snapshot)};
    return R.report({kind:'workbench-analysis',metadata:{started_at:run.started_at,completed_at:run.completed_at,source_url:'https://oglcnac.org/analysis/',dataset_revision:run.manifest.revision,model_version:run.model.version,species_model:run.species,scope:{complete_results:rows.length,filtered_results:filtered.length,filters},input_sequences:sequences,citation_metadata:run.citations.status},files});
  }
  root.OglcnacResearchReports={provenance,citations,protein,captureWorkbench,workbench};
})(typeof window==='undefined'?globalThis:window);
