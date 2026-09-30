(function(){
  'use strict';
  const T=window.OglcnacAtlasTools,V=window.OglcnacRecordView,D=window.OglcnacStaticData,E=window.OglcnacAtlasEvidence;
  const el=id=>document.getElementById(id),form=el('atlas-search-form'),selected=new Set(),selects={species:el('atlas-species-filter'),position:el('atlas-position-filter')};
  const evidence=OglcnacTables.create('search_result',{mobileColumns:[0,2,3,4],filename:'oglcnac-atlas-evidence-search.csv'});
  const proteins=OglcnacTables.create('atlas_proteins',{mobileColumns:[0,1,2,3,4,5],filename:'oglcnac-atlas-proteins.csv',rowLabel:'protein entries',label:'Atlas protein'});
  const batchTable=OglcnacTables.create('atlas_batch_report',{label:'Batch report',filename:'atlas-batch-report.csv',mobileColumns:[1,2,3]});
  let rows=[],matches=[],papers={},filters={},query={},report=[],view='proteins',generation=0,ready=false;
  for(const [key,label] of T.FACETS.slice(2)){const field=T.node('label',label,{for:'atlas-'+key+'-filter'}),select=T.node('select',undefined,{id:'atlas-'+key+'-filter',disabled:''});select.add(new Option('Any '+label.toLowerCase(),''));el('atlas-context-filters').append(field,select);selects[key]=select;}
  el('atlas-filter-disclosure').open=matchMedia('(min-width:901px)').matches;
  T.mountSave(el('atlas-save-selection'),()=>[...selected]);
  function status(text){el('atlas-search-status').textContent=text;}
  function url(push){const params=new URLSearchParams(query);if(view==='evidence')params.set('view',view);for(const [key,value] of Object.entries(filters))if(value)params.set(key,value);const next=location.pathname+(params.size?'?'+params:'');if(next!==location.pathname+location.search)history[push?'pushState':'replaceState'](null,'',next);}
  function selection(){
    el('atlas-selected-count').textContent=`${selected.size} selected across filters`;
    el('atlas-clear-selection').disabled=!selected.size;
    el('atlas-compare-selected').disabled=selected.size<2||selected.size>4;
    el('atlas-compare-selected').textContent=selected.size>4?'Compare 2–4 proteins':'Compare selected';
    document.querySelectorAll('[data-select-accession]').forEach(input=>{input.checked=selected.has(input.dataset.selectAccession);});
  }
  function accessionCell(accession,selectable=false){return {text:accession||'Not reported',render(cell){if(!accession){cell.textContent='Not reported';return;}const wrapper=T.node('div',undefined,{class:'atlas-accession-cell'});if(selectable){const input=T.node('input',undefined,{type:'checkbox','aria-label':'Select '+accession,'data-select-accession':accession});input.checked=selected.has(accession);input.addEventListener('change',()=>{if(input.checked&&selected.size>=T.LIMIT){input.checked=false;status('Select at most 500 proteins.');return;}input.checked?selected.add(accession):selected.delete(accession);selection();});const label=T.node('label',undefined,{class:'atlas-select-protein'});label.append(input);wrapper.append(label);}wrapper.append(T.node('a',accession,{href:T.detailURL(accession,filters)}));cell.append(wrapper);}};}
  function render(){
    matches=T.filter(rows,filters,papers);const groups=V.groupProteins(matches),counts=T.facets(rows,filters,papers);
    for(const [key,label] of T.FACETS){const select=selects[key];select.replaceChildren(new Option(key==='species'?'All species':key==='position'?'Any record':'Any '+label.toLowerCase(),''));for(const item of counts[key])select.add(new Option(`${item.label} (${item.count.toLocaleString()})`,item.value));select.value=filters[key]||'';select.disabled=!ready;}
    proteins.setRows(groups.map(p=>[accessionCell(p.accession,true),p.protein_name||'Not reported',p.gene_name||'Not reported',p.species||'Not reported',p.positions.length,p.recordCount]));
    evidence.setRows(matches.map(r=>[accessionCell(r.accession),r.entry_name,r.protein_name,r.gene_name,r.position_in_protein,{text:r.accession?'UniProt':'',href:r.accession?`https://www.uniprot.org/uniprotkb/${encodeURIComponent(r.accession)}/entry`:'',external:true}]));
    el('atlas-match-summary').textContent=`${groups.length.toLocaleString()} protein ${groups.length===1?'entry':'entries'} · ${matches.length.toLocaleString()} matching evidence records`;
    el('atlas-protein-count').textContent=groups.length.toLocaleString();el('atlas-evidence-count').textContent=matches.length.toLocaleString();
    const count=Object.values(filters).filter(Boolean).length;el('atlas-filter-count').textContent=count?`(${count} active)`:'';el('atlas-clear-filters').disabled=!count;
    el('atlas-selection-bar').hidden=!ready;el('atlas-select-matching').disabled=!groups.length;el('atlas-download-matching').disabled=!matches.length;selection();setView(view,false);
  }
  function setView(value,save=true){view=value;el('atlas-protein-results').hidden=view!=='proteins';el('atlas-evidence-results').hidden=view!=='evidence';for(const type of ['proteins','evidence'])el('atlas-view-'+type).setAttribute('aria-pressed',String(type===view));proteins.updateOverflow();evidence.updateOverflow();if(save)url(true);}
  function batchReport(){el('atlas-batch-report').hidden=!report.length;if(!report.length)return;const counts=Object.fromEntries(['matched','unmatched','duplicate','invalid'].map(key=>[key,report.filter(r=>r.status===key).length]));el('atlas-batch-summary').textContent=`Batch report · ${counts.matched} matched · ${counts.unmatched} unmatched · ${counts.duplicate} duplicate · ${counts.invalid} invalid`;
    batchTable.setRows(report.map(r=>[r.line,r.input,r.status,r.accession||'—']));}
  async function run(next,restoredFilters={},push=true){
    const current=++generation;ready=false;rows=[];matches=[];selected.clear();filters=restoredFilters;query=next;status('');report=[];batchReport();selection();el('atlas-selection-bar').hidden=true;
    Object.values(selects).forEach(s=>s.disabled=true);el('atlas-clear-filters').disabled=true;
    [proteins,evidence].forEach(t=>t.setLoading('Loading Atlas records…'));el('atlas-match-summary').textContent='Loading matching proteins and evidence…';el('atlas-protein-count').textContent='';el('atlas-evidence-count').textContent='';
    document.body.classList.remove('atlas-query-pending');url(push);
    try{
      const parsed=next.ids?T.parseBatch(next.ids):null;
      const [data,metadata]=await Promise.all([parsed?D.loadAtlasProjection():D.searchAtlas(next.q,next.field),E.loadPublications().then(value=>({value})).catch(()=>({error:true}))]);
      if(current!==generation)return;
      papers=metadata.value||{};if(metadata.error)status('Publication metadata is unavailable. Year-filtered queries cannot include unverified dates. Retry the search to reload metadata.');
      if(parsed){const result=T.matchBatch(parsed,data);rows=result.records;report=result.report;batchReport();}else rows=data;
      ready=true;render();
    }catch(error){if(current!==generation)return;rows=[];matches=[];ready=false;[proteins,evidence].forEach(t=>t.setError('Atlas records could not be loaded. Please try again.'));el('atlas-match-summary').textContent='Search unavailable. Submit your search again to retry.';status(error.message);}
  }
  function restore(){const params=new URLSearchParams(location.search);filters=Object.fromEntries(T.FACETS.map(([key])=>[key,T.normalize(params.get(key))]));view=params.get('view')==='evidence'?'evidence':'proteins';setView(view,false);if(params.has('ids')){el('atlas-batch').open=true;el('atlas-batch-input').value=params.get('ids');run({ids:params.get('ids')},filters,false);}else if(params.get('q')){form.q.value=params.get('q');form.field.value=['accession','protein_name','gene_name','peptide_seq','species'].includes(params.get('field'))?params.get('field'):'accession';run({q:form.q.value,field:form.field.value},filters,false);}else{++generation;rows=[];ready=false;query={};report=[];batchReport();render();el('atlas-match-summary').textContent='Search above to explore curated proteins and their evidence.';}}
  form.addEventListener('submit',event=>{event.preventDefault();if(form.q.value.trim())run({q:form.q.value.trim(),field:form.field.value});});
  el('atlas-batch-form').addEventListener('submit',event=>{event.preventDefault();try{const entries=T.parseBatch(el('atlas-batch-input').value);run({ids:entries.map(r=>r.input).join(',')});}catch(e){status(e.message);}});
  el('atlas-batch-file').addEventListener('change',async event=>{try{const text=await T.readFile(event.target.files[0]);T.parseBatch(text);el('atlas-batch-input').value=text;status('List loaded. Select Find accessions to run the batch.');}catch(e){status(e.message);}});
  for(const [key,select] of Object.entries(selects))select.addEventListener('change',()=>{filters[key]=select.value;render();url(true);});
  el('atlas-clear-filters').addEventListener('click',()=>{filters={};render();url(true);});
  for(const type of ['proteins','evidence'])el('atlas-view-'+type).addEventListener('click',()=>setView(type));
  el('atlas-select-matching').addEventListener('click',()=>{const ids=T.unique(matches.map(r=>r.accession).filter(Boolean));if(T.unique([...selected,...ids]).length>T.LIMIT){status('This selection exceeds 500 proteins. Refine the results before selecting all.');return;}ids.forEach(id=>selected.add(id));selection();});
  el('atlas-clear-selection').addEventListener('click',()=>{selected.clear();selection();});
  el('atlas-compare-selected').addEventListener('click',()=>{if(selected.size>=2&&selected.size<=4)location.href=T.compareURL([...selected]);});
  el('atlas-download-batch').addEventListener('click',()=>T.download('atlas-batch-report.csv',OglcnacTables.rowsToText(['Entry','Input','Result','Atlas accession'],report.map(r=>[r.line,r.input,r.status,r.accession||'']),','),'text/csv;charset=utf-8'));
  el('atlas-download-matching').addEventListener('click',async()=>{
    const button=el('atlas-download-matching'),wanted=new Set(matches.map(r=>r.id)),ids=T.unique(matches.map(r=>r.accession));button.disabled=true;status('Preparing complete source fields for the matching evidence…');
    try{const full=(await D.loadAtlasRecordsForAccessions(ids)).filter(r=>wanted.has(r.id)),fields=V.exportFields(full);if(full.length!==wanted.size)throw Error('The release changed while preparing the export. Reload and try again.');T.download('atlas-matching-evidence.csv',OglcnacTables.rowsToText(fields,full.map(r=>fields.map(f=>r[f])),','),'text/csv;charset=utf-8');status(`Exported ${full.length.toLocaleString()} source records with all fields.`);}catch(e){status(e.message);}finally{button.disabled=!matches.length;}
  });
  addEventListener('popstate',restore);restore();
})();
