(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OglcnacProteinFigure=api;})(typeof window==='undefined'?globalThis:window,function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function wrap(value,size=115){const lines=[];let line='';for(const word of String(value).split(/\s+/)){const parts=word.match(new RegExp('.{1,'+size+'}','g'))||[];for(const part of parts){if(line.length+part.length+1>size){lines.push(line);line='';}line+=(line?' ':'')+part;}}if(line)lines.push(line);return lines;}
  function build(options,viewer=root.OglcnacProteinViewer,featuresAPI=root.OglcnacProteinFeatures){
    const {accession,name,species,sequence,records,annotation,filters={},provenance={}}=options;
    if(!sequence)throw Error('A protein sequence is required to export a coordinate figure.');
    const start=Number(options.start??1),end=Number(options.end??sequence.length);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>sequence.length)throw Error(`Choose a valid region within residues 1–${sequence.length}.`);
    const model=viewer.summarize(records,sequence),sites=model.sites.filter(s=>s.mapped&&s.position>=start&&s.position<=end);
    const verified=annotation?.state==='verified',annotations=verified?featuresAPI.features(annotation.metadata,sequence.length).filter(f=>f.end>=start&&f.start<=end):[];
    const groups=featuresAPI.lanes(annotations),body=[];let y=38;const width=1000,left=195,right=962,x=p=>left+(p-start)/Math.max(1,end-start)*(right-left);
    const text=(value,px,py,size=13,fill='#334f61',extra='')=>body.push(`<text x="${px}" y="${py}" font-size="${size}" fill="${fill}" ${extra}>${escape(value)}</text>`);
    const paragraph=(value,size=115)=>{for(const line of wrap(value,size)){text(line,38,y);y+=19;}};
    text('O-GlcNAcAtlas · Modification landscape',38,y,14,'#236677');y+=34;
    for(const line of wrap(accession+' · '+(name||'Protein record'),76)){text(line,38,y,21,'#183f59','font-weight="600"');y+=28;}
    paragraph(`${species||'Species not reported'} · ${sequence.length.toLocaleString('en-US')} aa · Displayed residues ${start}–${end}`);paragraph('Sequence source: '+(options.sequence_source?.label||'Source not specified'));y+=12;
    const filterText=Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' · ');paragraph('Evidence scope: '+(filterText||'All source records'));y+=10;
    const axis=y;body.push(`<line x1="${left}" x2="${right}" y1="${axis}" y2="${axis}" stroke="#6c8595"/>`);
    const ticks=[...new Set(Array.from({length:6},(_,i)=>start+Math.round((end-start)*i/5)))];
    for(const p of ticks){body.push(`<line x1="${x(p)}" x2="${x(p)}" y1="${axis}" y2="${axis+6}" stroke="#6c8595"/>`);text(p,x(p),axis-8,12,'#526a78',`text-anchor="${p===start?'start':p===end?'end':'middle'}"`);}y+=31;
    const tracks=[['unambiguous','Reported unambiguous','#216f7c'],['ambiguous','Reported ambiguous','#3877a6'],['other','Other / not reported','#6f7484'],['conflict','Residue conflicts','#966720']];
    for(const [key,label,color]of tracks){
      text(label,38,y+4,12);body.push(`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#dce5e9"/>`);
      for(const site of sites){if(key==='conflict'?!site.mismatch:!site.assignments[key])continue;const px=x(site.position),attributes=`data-position="${site.position}" data-kind="${key}"`;
        if(key==='unambiguous')body.push(`<circle cx="${px}" cy="${y}" r="4" fill="${color}" ${attributes}/>`);
        else if(key==='ambiguous')body.push(`<rect x="${px-4}" y="${y-4}" width="8" height="8" fill="${color}" ${attributes}/>`);
        else if(key==='other')body.push(`<path d="M${px},${y-5}l5,5l-5,5l-5,-5Z" fill="${color}" ${attributes}/>`);
        else body.push(`<path d="M${px-4},${y-4}l8,8m-8,0l8,-8" stroke="${color}" stroke-width="2" ${attributes}/>`);
      }y+=32;
    }
    y+=9;
    for(const group of groups){text(group.type,38,y+11,12);for(const f of group.items){const a=Math.max(start,f.start),b=Math.min(end,f.end),color={'Domain':'#276e98','Repeat':'#357c76','Coiled coil':'#876328','Region':'#72778e'}[f.type];body.push(`<rect x="${x(a)}" y="${y+f.lane*19}" width="${Math.max(2,x(b)-x(a))}" height="12" rx="2" fill="${color}" data-feature-start="${f.start}" data-feature-end="${f.end}"><title>${escape(`${f.type}: ${f.description} (${f.start}–${f.end})`)}</title></rect>`);}y+=group.lanes*19+14;}
    if(!annotations.length){paragraph(verified?'No verified domains or regions overlap this range.':'Domain coordinates omitted: '+(annotation?.state||'metadata unavailable')+'.');}
    y+=12;body.push(`<line x1="38" x2="962" y1="${y}" y2="${y}" stroke="#cddce4"/>`);y+=26;
    paragraph(`${sites.length} numeric positions in this region · ${records.length} source records in the evidence scope · ${model.publications.length} source publications.`);
    paragraph(`Not placed: ${model.unplaced} records without a numeric position; ${model.outside} records outside the available sequence. ${model.sites.filter(s=>s.mapped&&(s.position<start||s.position>end)).length} mapped positions fall outside this displayed region.`);
    paragraph('Legend: circle = reported unambiguous; square = reported ambiguous; diamond = other / not reported; × = source residue differs from the sequence. Positions are not corrected.');
    paragraph('Markers show source assignments, not effect size or confidence in biological function. Domain overlap does not establish a functional effect.');
    if(verified)paragraph(`Annotations: UniProt ${annotation.metadata.release||'release unavailable'} · entry v${annotation.metadata.entry_version||'?'} · sequence v${annotation.metadata.sequence_version||'?'} · exact sequence match.`);
    paragraph('Atlas release '+(provenance.atlas_release||'5.0')+' · data revision '+(provenance.delivery?.revision||'unavailable')+' · enrichment '+(provenance.enrichment?.revision||'unavailable'));
    paragraph('Source PMIDs: '+(model.publications.join(', ')||'Not reported'));
    paragraph(`oglcnac.org/atlas/detail/?id=${accession} · Figure range ${start}–${end} · 1-based residue coordinates.`);
    const height=y+20,metadata={schema_version:1,accession,sequence_length:sequence.length,sequence_sha256:options.sequence_sha256,sequence_source:options.sequence_source,range:{start,end},filters,source_record_ids:records.map(r=>r.id),sites:sites.map(s=>({position:s.position,reported_residues:s.reportedResidues,sequence_residue:s.residue,conflict:s.mismatch,assignments:s.assignments})),annotations,annotation_state:annotation?.state||'unavailable',provenance};
    return {width,height,start,end,metadata,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(accession+' O-GlcNAc source evidence, residues '+start+' to '+end)}"><title>${escape(accession+' modification landscape')}</title><metadata>${escape(JSON.stringify(metadata))}</metadata><rect width="100%" height="100%" fill="white"/><g font-family="Arial, Helvetica, sans-serif">${body.join('')}</g></svg>`};
  }
  async function png(figure){
    if(figure.height>8000)throw Error('This figure is too tall for a portable PNG. Choose a smaller region or download SVG.');
    const url=root.URL.createObjectURL(new Blob([figure.svg],{type:'image/svg+xml'}));
    try{const img=new root.Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('The figure could not be rendered. Download SVG or try again.'));img.src=url;});const canvas=root.document.createElement('canvas');canvas.width=figure.width*2;canvas.height=figure.height*2;const context=canvas.getContext('2d');if(!context)throw Error('PNG export is unavailable in this browser.');context.drawImage(img,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG export could not be completed.')),'image/png'));}finally{root.URL.revokeObjectURL(url);}
  }
  function mount(element,getContext,getRange){
    element.innerHTML='<summary>Export a scientific figure</summary><p>Preview a full protein or a chosen region. Downloads include the evidence scope, coordinate legend and data sources. SVG retains annotation descriptions and machine-readable coordinates.</p><div class="figure-options"><label for="figure-start">First residue<input type="number" id="figure-start" min="1" value="1"></label><label for="figure-end">Last residue<input type="number" id="figure-end" min="1"></label><button type="button" id="figure-current">Use current map region</button><button type="button" id="figure-full">Full protein</button><button type="button" id="figure-preview-button">Preview figure</button></div><p class="figure-scroll-note">On narrow screens, scroll the preview horizontally. Downloads contain the complete figure.</p><div class="figure-preview" id="figure-preview" tabindex="0" role="region" aria-label="Scientific figure preview; scroll horizontally to inspect the complete figure" hidden></div><div class="atlas-tool-actions"><button type="button" id="figure-svg">Download SVG</button><button type="button" id="figure-png">Download PNG · 2×</button></div><p id="figure-status" role="status"></p>';
    const el=id=>element.querySelector('#'+id);let initialized=false;
    const full=()=>{const context=getContext();el('figure-start').value=1;el('figure-end').value=context.sequence?.length||'';};
    element.addEventListener('toggle',()=>{if(element.open&&!initialized){full();initialized=true;}});
    el('figure-full').addEventListener('click',full);el('figure-current').addEventListener('click',()=>{const range=getRange();el('figure-start').value=range.start;el('figure-end').value=range.end||'';});
    async function run(format){
      const buttons=element.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);el('figure-preview').hidden=true;el('figure-status').textContent='Preparing a figure from the current evidence scope…';
      try{const context=getContext(),provenance=await root.OglcnacResearch.json('/static/data/atlas-research/manifest.json');const figure=build({...context,provenance,sequence_sha256:await root.OglcnacResearch.sha256(context.sequence),start:Number(el('figure-start').value),end:Number(el('figure-end').value)});el('figure-preview').innerHTML=figure.svg;el('figure-preview').hidden=false;
        if(format){const content=format==='png'?await png(figure):figure.svg;root.OglcnacResearch.download(`${context.accession.replace(/[^\w.-]/g,'_')}-${figure.start}-${figure.end}.${format}`,content,format==='png'?'image/png':'image/svg+xml;charset=utf-8');}el('figure-status').textContent=`${format?'Exported '+format.toUpperCase(): 'Preview ready'} · residues ${figure.start}–${figure.end} · ${figure.width}${format==='png'?' × 2':''} px wide. The figure captures filters at export time. Preview again after changing filters.`;
      }catch(error){el('figure-status').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
    }
    el('figure-preview-button').addEventListener('click',()=>run());for(const format of ['svg','png'])el('figure-'+format).addEventListener('click',()=>run(format));
  }
  return {escape,wrap,build,png,mount};
});
