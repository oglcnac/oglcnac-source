(function(){
  'use strict';
  const T=OglcnacAtlasTools,D=OglcnacStaticData,V=OglcnacRecordView,P=OglcnacProteinViewer,F=OglcnacProteinFeatures,E=OglcnacAtlasEvidence,el=id=>document.getElementById(id);
  let epoch=0,summary=[];
  function block(label,value){const div=T.node('div');div.append(T.node('dt',label),T.node('dd',String(value)));return div;}
  function svgNode(tag,attrs={},text){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  function track(id,model,items){
    const svg=svgNode('svg',{viewBox:'0 0 400 148',role:'img','aria-label':`${id}: reported positions and verified domains on its own ${model.sequence.length}-residue sequence. Exact coordinates are listed below.`,class:'atlas-comparison-track'});
    svg.append(svgNode('title',{},`${id} — independent coordinates, 1–${model.sequence.length}`));const x=p=>16+(p-1)/Math.max(1,model.sequence.length-1)*368;
    svg.append(svgNode('text',{x:16,y:17},'Reported positions'),svgNode('line',{x1:16,x2:384,y1:42,y2:42,class:'protein-map-axis'}));
    for(const site of model.sites.filter(s=>s.mapped)){const mark=svgNode('line',{x1:x(site.position),x2:x(site.position),y1:28,y2:56,stroke:site.mismatch?'#a15b16':'#236d77','stroke-width':2});mark.append(svgNode('title',{},`Position ${site.position}${site.mismatch?' · residue conflict':''} · ${site.records.length} records`));svg.append(mark);}
    svg.append(svgNode('text',{x:16,y:85},'Verified domains & repeats'),svgNode('line',{x1:16,x2:384,y1:105,y2:105,class:'protein-map-axis'}));
    for(const item of items.filter(f=>['Domain','Repeat'].includes(f.type))){const mark=svgNode('rect',{x:x(item.start),y:item.type==='Domain'?94:107,width:Math.max(2,x(item.end)-x(item.start)),height:10,fill:item.type==='Domain'?'#276e98':'#357c76'});mark.append(svgNode('title',{},`${item.description} · ${item.start}–${item.end}`));svg.append(mark);}
    svg.append(svgNode('text',{x:16,y:140},'1'),svgNode('text',{x:384,y:140,'text-anchor':'end'},model.sequence.length.toLocaleString()+' aa'));return svg;
  }
  async function protein(id){
    const detail=await D.getAtlasDetail(id);if(!detail.records.length)return {id,missing:true};
    const [snapshot,metadata]=await Promise.allSettled([D.loadAtlasSequenceSnapshotForAccessions([id]),E.load(id)]);
    const sequence=snapshot.status==='fulfilled'?snapshot.value.sequences[id]||'':'',context=metadata.status==='fulfilled'?metadata.value:null;
    let state;try{state=await F.verify(context?.protein,sequence,id);}catch(_){state='verification_unavailable';}
    const features=state==='verified'?F.features(context.protein,sequence.length):[];
    return {id,records:detail.records,model:P.summarize(detail.records,sequence),context,state,features};
  }
  function renderProtein(result){
    const card=T.node('article',undefined,{class:'atlas-comparison-protein','data-accession':result.id});card.append(T.node('h2',result.id));
    if(result.error||result.missing){card.append(T.node('p',result.error?'This record could not be loaded. Run the comparison again to retry.':'No exact Atlas record was found. Isoform accessions are not replaced with a canonical entry.',{class:'atlas-tool-status'}));return card;}
    const {id,records,model,features,state,context}=result,first=records[0],samples=V.values(records,'sample_type'),methods=V.values(records,'method'),conflicts=model.sites.filter(s=>s.mismatch).length;
    card.append(T.node('p',first.protein_name||'Protein name not reported',{class:'atlas-comparison-name'}),T.node('p',[V.values(records,'gene_name').join(' / '),V.values(records,'species').join(' / ')].filter(Boolean).join(' · '),{class:'atlas-comparison-identity'}),T.node('a','Open complete protein record',{href:T.detailURL(id)}));
    const metrics=T.node('dl',undefined,{class:'atlas-comparison-metrics'});for(const [label,value] of [['Numeric positions',model.sites.length],['Evidence records',records.length],['Source publications',model.publications.length],['Sequence length',model.sequence?model.sequence.length+' aa':'Unavailable']])metrics.append(block(label,value));card.append(metrics);
    if(model.sequence)card.append(track(id,model,features));else card.append(T.node('p','No local sequence is available; coordinates are not plotted.',{class:'atlas-comparison-missing'}));
    card.append(T.node('p',state==='verified'?`${features.length} verified UniProt annotations · release ${context.manifest.uniprot_release}. Domain and repeat intervals are shown above.`:'Verified annotation coordinates are unavailable for this sequence.',{class:'atlas-comparison-caption'}));
    card.append(T.node('p',`${model.unplaced} records lack a numeric position. ${model.sequence?`${model.outside} records fall outside the sequence; ${conflicts} positions have a residue conflict${conflicts?' (ochre marks)':''}.`:'Out-of-range and residue checks require a sequence.'}`,{class:'atlas-comparison-caption'}));
    for(const [title,items] of [['Sample types',samples],['Reported methods',methods]]){const section=T.node('section',undefined,{class:'atlas-comparison-context'});section.append(T.node('h3',title+' ('+items.length+')'));const list=T.node('ul');if(!items.length)list.append(T.node('li','Not reported'));else items.slice(0,4).forEach(item=>list.append(T.node('li',item)));section.append(list);if(items.length>4){const more=T.node('details'),rest=T.node('ul');more.append(T.node('summary','Show '+(items.length-4)+' more'));items.slice(4).forEach(item=>rest.append(T.node('li',item)));more.append(rest);section.append(more);}card.append(section);}
    const sites=T.node('details'),siteList=T.node('ul',undefined,{class:'atlas-coordinate-list'});sites.append(T.node('summary',`Reported positions (${model.sites.length})`));for(const site of model.sites){const li=T.node('li');li.append(T.node('a',`${site.position} · ${site.records.length} records${site.mismatch?' · residue conflict':''}`,{href:T.detailURL(id)+'&site='+site.position}));siteList.append(li);}if(!model.sites.length)siteList.append(T.node('li','No numeric positions reported.'));sites.append(siteList);card.append(sites);
    const domains=T.node('details'),domainList=T.node('ul',undefined,{class:'atlas-coordinate-list'});domains.append(T.node('summary',`Annotation coordinates (${features.length})`));features.forEach(f=>domainList.append(T.node('li',`${f.type} · ${f.start}–${f.end} · ${f.description}`)));if(!features.length)domainList.append(T.node('li',state==='verified'?'No eligible annotations in the verified snapshot.':'Coordinates unavailable.'));domains.append(domainList);card.append(domains);
    const papers=T.node('details'),paperList=T.node('ul');papers.append(T.node('summary',`Source publications (${model.publications.length})`));for(const pmid of model.publications){const li=T.node('li'),paper=context?.publications?.[pmid];li.append(T.node('a',paper?.status==='verified'?`${paper.year} · ${paper.title}`:'PMID '+pmid,{href:`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}));paperList.append(li);}if(!model.publications.length)paperList.append(T.node('li','No PMID reported.'));papers.append(paperList);card.append(papers);
    summary.push({accession:id,protein:first.protein_name,species:V.values(records,'species').join('; '),numeric_positions:model.sites.length,evidence_records:records.length,publications:model.publications.length,sequence_length:model.sequence.length||'Unavailable',samples:samples.join('; '),methods:methods.join('; '),annotation_state:state,verified_annotations:state==='verified'?features.length:'Unavailable',residue_conflicts:conflicts,coordinates:'Independent; not aligned'});return card;
  }
  async function run(text,push=true){
    const current=++epoch;document.body.classList.remove('atlas-comparison-loading');summary=[];el('compare-actions').hidden=true;el('compare-note').hidden=true;el('comparison-grid').replaceChildren();delete el('comparison-grid').dataset.ready;
    let ids;try{const entries=T.parseBatch(text);if(entries.some(e=>e.status!=='pending'))throw Error('Enter 2–4 distinct, valid accessions. Remove duplicates before comparing.');ids=entries.map(e=>e.normalized);if(ids.length<2||ids.length>4)throw Error('Choose between 2 and 4 proteins to compare.');}catch(e){el('compare-status').textContent=e.message;return;}
    el('compare-ids').value=ids.join(', ');if(push){const url=T.compareURL(ids);if(url!==location.pathname+location.search)history.pushState(null,'',url);}
    document.body.classList.add('atlas-comparison-loading');
    el('compare-status').textContent='Loading protein evidence and verified sequence context…';el('comparison-grid').dataset.count=ids.length;
    try{ids=await D.resolveAtlasAccessions(ids);}catch(_){}
    const results=await Promise.all(ids.map(id=>protein(id).catch(()=>({id,error:true}))));if(current!==epoch)return;
    results.forEach(result=>el('comparison-grid').append(renderProtein(result)));el('compare-actions').hidden=false;el('compare-export').disabled=!summary.length;el('compare-note').hidden=false;
    el('compare-status').textContent=`${summary.length} of ${ids.length} proteins loaded. ${summary.length<ids.length?'Unavailable entries are shown individually.':'Comparison uses complete source evidence.'}`;
    el('comparison-grid').dataset.ready='true';document.body.classList.remove('atlas-comparison-loading');
  }
  el('compare-form').addEventListener('submit',event=>{event.preventDefault();run(el('compare-ids').value);});
  el('compare-export').addEventListener('click',()=>{const fields=Object.keys(summary[0]||{});T.download('atlas-protein-comparison.csv',OglcnacTables.rowsToText(fields,summary.map(row=>fields.map(f=>row[f])),','),'text/csv;charset=utf-8');});
  el('compare-share').addEventListener('click',async()=>{el('compare-status').textContent=await P.copyText(location.href)?'Comparison link copied.':'Copy the comparison URL from the address bar.';});
  function restore(){const ids=new URLSearchParams(location.search).get('ids');if(ids)run(ids,false);else{++epoch;document.body.classList.remove('atlas-comparison-loading');el('comparison-grid').replaceChildren();el('compare-actions').hidden=true;el('compare-note').hidden=true;el('compare-status').textContent='Choose proteins to build a comparison.';}}
  addEventListener('popstate',restore);restore();
})();
