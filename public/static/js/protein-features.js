(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OglcnacProteinFeatures=api;})(typeof window==='undefined'?globalThis:window,function(browser){
  'use strict';
  const TYPES=['Domain','Repeat','Coiled coil','Region'];
  const COLORS={'Domain':'#276e98','Repeat':'#357c76','Coiled coil':'#876328','Region':'#72778e'};
  function features(item,length){
    return (item?.features||[]).filter(f=>TYPES.includes(f.type)&&Number.isSafeInteger(f.start)&&Number.isSafeInteger(f.end)&&f.start>0&&f.end>=f.start&&f.end<=length);
  }
  async function verify(item,sequence,accession){
    if(!item)return 'unavailable';
    if(item.accession!==accession)return 'identifier_mismatch';
    if(item.status!=='verified')return item.status;
    if(!sequence)return 'snapshot_unavailable';
    if(item.snapshot_length!==sequence.length||item.source_length!==sequence.length||item.snapshot_sha256!==item.source_sha256)return 'sequence_mismatch';
    if(!browser.crypto?.subtle)return 'verification_unavailable';
    const hash=[...new Uint8Array(await browser.crypto.subtle.digest('SHA-256',new TextEncoder().encode(sequence)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return hash===item.snapshot_sha256?'verified':'sequence_mismatch';
  }
  function overlap(items,selection){return selection?.site?.mapped&&!selection.site.mismatch?items.filter(f=>f.start<=selection.position&&f.end>=selection.position):[];}
  function lanes(items){
    const rows=[];
    for(const type of TYPES){const group=items.map((f,index)=>({...f,index})).filter(f=>f.type===type).sort((a,b)=>a.start-b.start||a.end-b.end);const ends=[];
      for(const f of group){let lane=ends.findIndex(end=>end<f.start);if(lane<0)lane=ends.length;ends[lane]=f.end;f.lane=lane;}
      if(group.length)rows.push({type,items:group,lanes:ends.length});
    }return rows;
  }
  function create(element,options){
    let metadata,sequence='',sequenceReady=false,metadataReady=false,selection=null,state='loading',items=[],chosen=-1,epoch=0,destroyed=false;
    element.innerHTML='<p class="feature-status" data-feature="status" role="status">Loading verified annotation context…</p><div data-feature="content" hidden><p class="feature-intro">UniProt annotations on the verified Atlas sequence. These describe protein regions; they are not additional O-GlcNAc evidence.</p><svg class="protein-feature-map" data-feature="map" role="img" aria-label="Protein domains and regions. Use the annotation menu for descriptions and exact coordinates."></svg><label class="feature-selector" for="atlas-feature-select">Inspect an annotation<select id="atlas-feature-select"><option value="">Choose an annotation</option></select></label><div class="feature-detail" data-feature="detail" role="status" aria-live="polite"></div><p class="feature-overlap" data-feature="overlap"></p><details class="feature-inventory"><summary data-feature="inventory-label">All annotations</summary><ul data-feature="inventory"></ul></details></div><p class="feature-provenance" data-feature="provenance"></p><p class="feature-audit" data-feature="audit" hidden></p>';
    const el=key=>element.querySelector(`[data-feature="${key}"]`),select=element.querySelector('select');
    const node=(tag,attrs={},text)=>{const n=browser.document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
    const describe=f=>`${f.type} · ${f.start.toLocaleString()}–${f.end.toLocaleString()} · ${f.description}`;
    function draw(){
      const svg=el('map'),width=svg.getBoundingClientRect().width;if(!width||state!=='verified')return;
      svg.replaceChildren();const x=p=>12+(p-1)/Math.max(1,sequence.length-1)*(width-24);let y=22;
      const groups=lanes(items);const height=groups.reduce((n,g)=>n+29+g.lanes*22,58);
      svg.style.height=height+'px';svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      svg.append(node('title',{},`${items.length} UniProt annotations on ${options.accession}, ${sequence.length} residues. Exact descriptions and coordinates are available in the annotation menu and list.`));
      if(selection?.site?.mapped&&!selection.site.mismatch)svg.append(node('line',{x1:x(selection.position),x2:x(selection.position),y1:12,y2:height-28,class:'feature-selection-line'}));
      for(const group of groups){svg.append(node('text',{x:12,y},group.type));y+=9;
        for(const f of group.items){const bar=node('rect',{x:x(f.start),y:y+f.lane*22,width:Math.max(3,x(f.end)-x(f.start)),height:14,rx:2,fill:COLORS[f.type],class:f.index===chosen?'feature-bar feature-bar-selected':'feature-bar'});bar.append(node('title',{},describe(f)));bar.addEventListener('click',()=>choose(f.index));svg.append(bar);}y+=group.lanes*22+20;
      }
      svg.append(node('line',{x1:12,x2:width-12,y1:height-26,y2:height-26,class:'protein-map-axis'}));
      for(let i=0;i<3;i++){const p=1+Math.round((sequence.length-1)*i/2);svg.append(node('text',{x:x(p),y:height-8,'text-anchor':i===0?'start':i===2?'end':'middle'},p.toLocaleString()));}
    }
    function choose(index){chosen=Number.isInteger(index)&&items[index]?index:-1;select.value=chosen<0?'':String(chosen);const f=items[chosen];el('detail').replaceChildren();
      if(f){const strong=browser.document.createElement('strong');strong.textContent=f.description;const range=browser.document.createElement('p');range.textContent=`${f.type} · residues ${f.start.toLocaleString()}–${f.end.toLocaleString()} · ${(f.end-f.start+1).toLocaleString()} aa`;el('detail').append(strong,range);
        const evidence=browser.document.createElement('p');evidence.className='feature-source-evidence';evidence.textContent=f.evidence?.length?'UniProt annotation evidence: '+f.evidence.map(e=>[e.code,e.source,e.id].filter(Boolean).join(' ')).join('; '):'No annotation evidence code provided in this snapshot.';el('detail').append(evidence);
      }else el('detail').textContent='Choose a region above to read its description and coordinates.';
      draw();
    }
    function selected(){
      if(!selection?.position)el('overlap').textContent='Select a reported modification position in the map above to inspect overlapping annotations.';
      else if(selection.site?.mismatch)el('overlap').textContent=`Position ${selection.position}: the reported residue differs from the sequence. No site-to-region association is asserted.`;
      else if(!selection.site?.mapped)el('overlap').textContent=`Position ${selection.position} cannot be placed on this sequence.`;
      else{const hit=overlap(items,selection);el('overlap').textContent=`Position ${selection.position} overlaps ${hit.length} ${hit.length===1?'annotation':'annotations'}${hit.length?': '+hit.map(f=>`${f.description} (${f.start}–${f.end})`).join('; '):' in this snapshot'}. Coordinate overlap alone does not establish a functional effect.`;}
      const audit=metadata?.sequence_audit?.mismatches||[],selectedAudit=audit.find(row=>row.position===selection?.position);el('audit').replaceChildren();el('audit').hidden=!audit.length;
      if(audit.length){let text=`Sequence audit: ${audit.length} reported ${audit.length===1?'position has':'positions have'} a residue mismatch. Original source values are retained.`;
        if(selectedAudit){text+=` At position ${selectedAudit.position}, the source reports ${selectedAudit.reported_residues.join('/')} and the sequence contains ${selectedAudit.snapshot_residue}. `;
          text+=selectedAudit.classification==='consistent_peptide_candidate'?`Exact peptide matching suggests position ${selectedAudit.candidate_positions.join(', ')} for the conflicting records. This is an audit candidate, not a corrected site.`:selectedAudit.classification==='partial_peptide_support'?`Some conflicting records have a unique peptide match at ${selectedAudit.candidate_positions.join(', ')}; the evidence is insufficient to assign a corrected site.`:'Peptide matching does not establish a consistent alternative position.';
        }
        el('audit').append(browser.document.createTextNode(text+' '));const link=browser.document.createElement('a');link.href='/static/data/atlas-enrichment/mapping-audit.json';link.textContent='Download the complete mapping audit (JSON)';link.download='atlas-mapping-audit.json';el('audit').append(link);
      }draw();
    }
    async function update(){
      if(!metadataReady||!sequenceReady)return;
      const current=++epoch;let result;try{result=await verify(metadata,sequence,options.accession);}catch(_){result='verification_unavailable';}if(destroyed||current!==epoch)return;
      state=result;element.dataset.state=state;items=state==='verified'?features(metadata,sequence.length):[];
      const messages={unavailable:'Annotation details are unavailable. The original Atlas evidence remains accessible.',identifier_mismatch:'Annotation accession does not match this record; coordinates are not shown.',not_uniprot:'No verified UniProt annotation mapping is available for this accession.',entry_unavailable:'This accession has no verified entry in the annotation snapshot.',snapshot_unavailable:'Annotations cannot be mapped without a matching Atlas sequence.',source_sequence_unavailable:'The provider sequence could not be verified; coordinates are not shown.',sequence_mismatch:'The displayed sequence differs from the annotation snapshot; coordinates are not shown.',isoform_annotations_unavailable:'Isoform-specific annotation coordinates are unavailable. Canonical annotations are not transferred to this isoform.',verification_unavailable:'Sequence verification is unavailable in this browser; coordinates are not shown.'};
      el('status').textContent=state==='verified'?`${items.length} ${items.length===1?'annotation':'annotations'} · exact sequence match · ${sequence.length.toLocaleString()} aa`:messages[state]||messages.unavailable;
      el('content').hidden=state!=='verified'||!items.length;
      if(state==='verified'&&!items.length)el('status').textContent+=' · No domains or regions with exact boundaries are annotated in this snapshot.';
      el('provenance').replaceChildren();if(metadata?.source){const source=browser.document.createElement('a');source.href=`https://www.uniprot.org/uniprotkb/${encodeURIComponent(options.accession)}/entry`;source.textContent='UniProt';el('provenance').append(source,browser.document.createTextNode(` · release ${metadata.release} · entry v${metadata.entry_version} · sequence v${metadata.sequence_version} · retrieved ${metadata.retrieved}.`));const excluded=Object.values(metadata.excluded_features||{}).reduce((n,v)=>n+v,0);if(excluded)el('provenance').append(browser.document.createTextNode(` ${excluded} annotations with uncertain, invalid, or isoform-specific coordinates are omitted.`));}
      select.replaceChildren();const placeholder=browser.document.createElement('option');placeholder.value='';placeholder.textContent='Choose an annotation';select.append(placeholder);el('inventory').replaceChildren();
      items.forEach((f,index)=>{const option=browser.document.createElement('option');option.value=index;option.textContent=describe(f);select.append(option);const li=browser.document.createElement('li');li.textContent=describe(f);el('inventory').append(li);});
      el('inventory-label').textContent=`All ${items.length} annotations with coordinates`;choose(-1);selected();
    }
    select.addEventListener('change',()=>choose(select.value===''?-1:Number(select.value)));
    const resize=new browser.ResizeObserver(draw);resize.observe(element);
    return {setMetadata(value){metadata=value;metadataReady=true;update();},setSequence(value){sequence=value;sequenceReady=true;update();},setSelection(value){selection=value;selected();},destroy(){destroyed=true;epoch++;resize.disconnect();}};
  }
  return {TYPES,features,verify,overlap,lanes,create};
});
