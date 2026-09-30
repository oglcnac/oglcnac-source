(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OglcnacAtlasTools=api;})(typeof window==='undefined'?globalThis:window,function(browser){
  'use strict';
  const EMPTY='__unreported__', UNKNOWN='__unavailable__', LIMIT=500;
  const COLLECTION_KEY='oglcnac:collections:v1', REVIEW_KEY='oglcnac:reviews:v1';
  const FACETS=[['species','Species'],['position','Position annotation'],['method','Reported method'],['sample','Sample type'],['ambiguity','Site assignment'],['pmid','Publication'],['year','Publication year']];
  const fieldFor={species:'species',method:'method',sample:'sample_type',ambiguity:'ambiguous'};
  const clean=value=>String(value??'').trim().replace(/\s+/g,' '), normalize=value=>clean(value).toLowerCase();
  const pmids=row=>[...new Set(String(row.pmid??'').match(/\b\d{6,9}\b/g)||[])];
  const accession=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value);
  const unique=values=>[...new Set(values)];
  function years(row,papers,selected){
    const ids=selected&&selected!==EMPTY?[selected]:pmids(row);
    return unique((ids.length?ids:['']).map(id=>papers[id]?.status==='verified'&&/^\d{4}$/.test(String(papers[id].year))?String(papers[id].year):UNKNOWN));
  }
  function values(row,key,papers={},filters={}){
    if(key==='pmid')return pmids(row).length?pmids(row):[EMPTY];
    if(key==='year')return years(row,papers,filters.pmid);
    if(key==='position')return [/^(?:|na|n\/a|null|none|not reported|-)$/i.test(clean(row.position_in_protein))?'unreported':'reported'];
    return [normalize(row[fieldFor[key]])||EMPTY];
  }
  function filter(rows,filters={},papers={},omit=''){
    return rows.filter(row=>FACETS.every(([key])=>key===omit||!filters[key]||values(row,key,papers,filters).includes(normalize(filters[key]))));
  }
  function facets(rows,filters={},papers={}){
    return Object.fromEntries(FACETS.map(([key])=>{
      const options=new Map();
      const label=(row,value)=>value===EMPTY?'Not reported':value===UNKNOWN?'Year unavailable':key==='position'?(value==='reported'?'Annotation present':'Not reported'):key==='pmid'?`PMID ${value}${papers[value]?.year?' · '+papers[value].year:''}`:key==='year'?value:clean(row[fieldFor[key]]);
      for(const row of rows)for(const value of values(row,key,papers,filters))if(!options.has(value))options.set(value,{value,label:label(row,value),count:0});
      for(const row of filter(rows,filters,papers,key))for(const value of values(row,key,papers,filters))if(options.has(value))options.get(value).count++;
      if(filters[key]&&!options.has(filters[key]))options.set(filters[key],{value:filters[key],label:`Not in results: ${filters[key]}`,count:0});
      return [key,[...options.values()].sort((a,b)=>key==='year'?b.label.localeCompare(a.label):a.label.localeCompare(b.label,undefined,{numeric:true}))];
    }));
  }
  function parseBatch(text){
    if(typeof text!=='string'||text.length>100000)throw Error('Use a plain-text list smaller than 100 KB.');
    let tokens=text.trim().split(/[\s,;]+/).filter(Boolean);
    if(/^"?accessions?"?$/i.test(tokens[0]||''))tokens.shift();
    if(!tokens.length)throw Error('Enter at least one accession.');
    if(tokens.length>LIMIT)throw Error(`Use at most ${LIMIT} entries per batch; no entries were processed.`);
    const seen=new Set();
    return tokens.map((input,index)=>{const token=input.replace(/^"([^"\s]+)"$/,'$1'),normalized=token.toUpperCase();let status='pending';
      if(!accession(token))status='invalid';else if(seen.has(normalized))status='duplicate';else seen.add(normalized);
      return {line:index+1,input,normalized,status};
    });
  }
  function matchBatch(entries,rows){
    const known=new Map(rows.filter(r=>r.accession).map(r=>[String(r.accession).toUpperCase(),r.accession]));
    const report=entries.map(entry=>entry.status==='pending'?{...entry,status:known.has(entry.normalized)?'matched':'unmatched',accession:known.get(entry.normalized)||''}:{...entry});
    const ids=new Set(report.filter(r=>r.status==='matched').map(r=>r.accession));
    return {report,accessions:[...ids],records:rows.filter(r=>ids.has(r.accession))};
  }
  function id(){return browser.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  const timestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));
  function validString(value,min,max){return typeof value==='string'&&value.trim().length>=min&&value.length<=max;}
  function validateCollections(payload){
    if(!payload||payload.kind!=='oglcnac-collections'||payload.schema_version!==1||!Array.isArray(payload.collections)||payload.collections.length>100)throw Error('This is not a supported collection backup (version 1, up to 100 collections).');
    const seen=new Set();
    const collections=payload.collections.map(c=>{
      if(!c||!validString(c.id,1,100)||seen.has(c.id)||!validString(c.name,1,100)||!timestamp(c.updated)||!Array.isArray(c.accessions)||c.accessions.length>LIMIT||!c.accessions.every(accession))throw Error('A collection is invalid. No collections were imported.');
      seen.add(c.id);return {id:c.id,name:c.name.trim(),updated:c.updated,accessions:unique(c.accessions)};
    });
    return {kind:'oglcnac-collections',schema_version:1,collections};
  }
  function mergeCollections(current,incoming){
    const result=validateCollections(current),other=validateCollections(incoming);
    for(const c of other.collections){
      const existing=result.collections.find(item=>item.id===c.id);
      if(existing&&existing.name===c.name&&JSON.stringify(existing.accessions)===JSON.stringify(c.accessions))continue;
      result.collections.push({...c,id:existing?id():c.id,name:existing?`${c.name.slice(0,89)} (imported)`:c.name});
    }
    return validateCollections(result);
  }
  function auditCases(audit){return Object.entries(audit.accessions||{}).flatMap(([accession,entry])=>(entry.mismatches||[]).map(item=>({...item,accession,key:`${accession}:${item.position}`})));}
  const decisions=['needs-evidence','retain-source','propose-correction'];
  function validateReviews(payload,revision,cases){
    if(!payload||payload.kind!=='oglcnac-reviews'||payload.schema_version!==1||payload.audit_revision!==revision||!Array.isArray(payload.events)||payload.events.length>10000)throw Error('Review backup is invalid or belongs to a different audit revision. Nothing was imported.');
    const known=new Map(cases.map(c=>[c.key,c])),ids=new Set();
    const events=payload.events.map(e=>{
      const item=known.get(e?.key);
      if(!item||!validString(e.id,1,100)||ids.has(e.id)||!timestamp(e.created)||!validString(e.reviewer,1,120)||!validString(e.rationale,10,4000)||!decisions.includes(e.decision)||!Array.isArray(e.pmids)||e.pmids.length>20||!e.pmids.every(p=>typeof p==='string'&&/^\d{6,9}$/.test(p)))throw Error('A review entry is invalid. No review history was changed.');
      if(e.decision==='propose-correction'&&(!Number.isSafeInteger(e.proposed_position)||e.proposed_position<1||e.proposed_position===item.position||!e.pmids.length))throw Error('A correction proposal needs a different positive position and a supporting PMID.');
      if(e.decision!=='propose-correction'&&e.proposed_position!==null)throw Error('Only a correction proposal can include a proposed coordinate.');
      ids.add(e.id);return {id:e.id,key:e.key,created:e.created,reviewer:e.reviewer.trim(),decision:e.decision,rationale:e.rationale.trim(),pmids:unique(e.pmids),proposed_position:e.proposed_position};
    });
    return {kind:'oglcnac-reviews',schema_version:1,audit_revision:revision,events};
  }
  function mergeReviews(current,incoming,revision,cases){
    const result=validateReviews(current,revision,cases),other=validateReviews(incoming,revision,cases),known=new Map(result.events.map(e=>[e.id,e]));
    for(const e of other.events){if(known.has(e.id)){if(JSON.stringify(known.get(e.id))!==JSON.stringify(e))throw Error('Conflicting review history: an existing entry was changed. Nothing was imported.');}else result.events.push(e);}
    return validateReviews(result,revision,cases);
  }
  function store(key,empty,validate,storage){
    function read(){try{const raw=(storage||browser.localStorage).getItem(key);return validate(raw?JSON.parse(raw):empty());}catch(error){throw Error('Browser storage is unavailable or contains an incompatible backup. Export any accessible work and check browser storage settings. '+error.message);}}
    function write(value){const valid=validate(value),serialized=JSON.stringify(valid);if(new TextEncoder().encode(serialized).byteLength>16*1024*1024)throw Error('Saved work exceeds the 16 MB backup limit. Export and use smaller collections or review histories.');try{(storage||browser.localStorage).setItem(key,serialized);}catch(_){throw Error('Could not save in this browser. Storage may be disabled or full; export a backup before leaving.');}return valid;}
    return {read,write,update(fn){return write(fn(read()));}};
  }
  const collectionStore=storage=>store(COLLECTION_KEY,()=>({kind:'oglcnac-collections',schema_version:1,collections:[]}),validateCollections,storage);
  const reviewStore=(revision,cases,storage)=>store(REVIEW_KEY,()=>({kind:'oglcnac-reviews',schema_version:1,audit_revision:revision,events:[]}),v=>validateReviews(v,revision,cases),storage);
  function node(tag,text,attrs={}){const n=browser.document.createElement(tag);if(text!==undefined)n.textContent=text;Object.entries(attrs).forEach(([key,value])=>n.setAttribute(key,value));return n;}
  function download(filename,value,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const a=node('a','',{href:url,download:filename});browser.document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function readFile(file,maxBytes=1024*1024){if(!file)throw Error('Choose a file first.');if(file.size>maxBytes)throw Error('Choose a file smaller than '+(maxBytes/1024/1024)+' MB.');return file.text();}
  function detailURL(id,filters={}){const params=new URLSearchParams({id});for(const key of ['method','sample','ambiguity','pmid','year'])if(filters[key])params.set(key,filters[key]);return '/atlas/detail/?'+params;}
  const compareURL=ids=>'/atlas/compare/?ids='+encodeURIComponent(unique(ids).join(','));
  function selectionCell(accession,selected,onChange){return {text:'',render(cell){if(!accession){cell.textContent='—';return;}const label=node('label',undefined,{class:'atlas-select-protein'}),input=node('input',undefined,{type:'checkbox','aria-label':'Select '+accession,'data-select-accession':accession});input.checked=selected.has(accession);input.addEventListener('change',()=>{input.checked?selected.add(accession):selected.delete(accession);onChange();});label.append(input,node('span','Select '+accession,{class:'visually-hidden'}));cell.append(label);}};}
  function saveSelection(ids,name,collectionId=''){
    if(!ids.length)throw Error('Select at least one protein.');
    if(!collectionId&&!clean(name))throw Error('Enter a name for the new collection.');
    return collectionStore().update(data=>{
      const existing=data.collections.find(c=>c.id===collectionId);
      if(collectionId&&!existing)throw Error('That collection was removed in another tab. Choose a collection again.');
      if(existing){existing.accessions=unique([...existing.accessions,...ids]);existing.updated=new Date().toISOString();}
      else data.collections.push({id:id(),name:clean(name),accessions:unique(ids),updated:new Date().toISOString()});
      return data;
    });
  }
  function mountSave(element,getIds,onSaved){
    const select=node('select',undefined,{'aria-label':'Save to collection'}),input=node('input',undefined,{type:'text',placeholder:'New collection name','aria-label':'New collection name',maxlength:'100'}),button=node('button','Save to collection',{type:'button'}),status=node('p','',{role:'status',class:'atlas-tool-status'});
    element.append(select,input,button,status);
    function refresh(){const previous=select.value;select.replaceChildren(new Option('New collection',''));try{for(const c of collectionStore().read().collections)select.add(new Option(c.name,c.id));if([...select.options].some(o=>o.value===previous))select.value=previous;button.disabled=false;}catch(e){status.textContent=e.message;button.disabled=true;}input.hidden=!!select.value;}
    select.addEventListener('change',()=>{input.hidden=!!select.value;});
    button.addEventListener('click',()=>{try{saveSelection(getIds(),input.value,select.value);status.textContent=`Saved ${getIds().length} protein accessions in this browser.`;refresh();onSaved?.();}catch(e){status.textContent=e.message;}});
    browser.addEventListener('storage',event=>{if(event.key===COLLECTION_KEY)refresh();});refresh();return{refresh};
  }
  return {EMPTY,UNKNOWN,LIMIT,COLLECTION_KEY,REVIEW_KEY,FACETS,clean,normalize,pmids,accession,unique,values,years,filter,facets,parseBatch,matchBatch,id,validateCollections,mergeCollections,auditCases,decisions,validateReviews,mergeReviews,collectionStore,reviewStore,node,download,readFile,detailURL,compareURL,selectionCell,saveSelection,mountSave};
});
