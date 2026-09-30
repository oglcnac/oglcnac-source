(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OglcnacAtlasEvidence=api;})(typeof window==='undefined'?globalThis:window,function(browser){
  'use strict';
  const EMPTY='__unreported__';
  const FACETS=[{key:'method',field:'method',label:'Reported method'},{key:'sample',field:'sample_type',label:'Sample type'},{key:'ambiguity',field:'ambiguous',label:'Site assignment'},{key:'pmid',field:'pmid',label:'Publication'},{key:'year',field:'pmid',label:'Publication year'}];
  const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
  const normalize=value=>clean(value).toLowerCase();
  const pmids=rows=>[...new Set(rows.flatMap(row=>String(row.pmid??'').match(/\b\d{6,9}\b/g)||[]))];
  const coordinate=value=>/^\d+$/.test(String(value??'').trim())&&Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
  function facetValues(row,key,field,papers={},filters={}){
    if(key==='pmid')return pmids([row]).length?pmids([row]):[EMPTY];
    if(key==='year'){const ids=filters.pmid&&filters.pmid!==EMPTY?[filters.pmid]:pmids([row]);return [...new Set((ids.length?ids:['']).map(id=>papers[id]?.status==='verified'&&/^\d{4}$/.test(String(papers[id].year))?String(papers[id].year):'__unavailable__'))];}
    return [normalize(row[field])||EMPTY];
  }
  function filter(rows,filters={},site=null,omit='',papers={}){
    return rows.filter(row=>(!site||coordinate(row.position_in_protein)===site)&&FACETS.every(({key,field})=>{
      if(key===omit||!filters[key])return true;
      return facetValues(row,key,field,papers,filters).includes(normalize(filters[key]));
    }));
  }
  function facets(rows,filters={},site=null,papers={}){
    return Object.fromEntries(FACETS.map(({key,field})=>{
      const universe=new Map();
      for(const row of rows){
        const values=facetValues(row,key,field,papers,filters);
        for(const value of values)if(!universe.has(value))universe.set(value,{value,label:value===EMPTY?'Not reported':value==='__unavailable__'?'Year unavailable':key==='pmid'?`PMID ${value}`:key==='year'?value:clean(row[field]),count:0});
      }
      for(const row of filter(rows,filters,site,key,papers)){
        const values=facetValues(row,key,field,papers,filters);
        for(const value of values)universe.get(value).count++;
      }
      if(filters[key]&&!universe.has(filters[key]))universe.set(filters[key],{value:filters[key],label:`Not in this record: ${filters[key]}`,count:0});
      return [key,[...universe.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}))];
    }));
  }
  function fromURL(url){const parsed=new URL(url,'https://oglcnac.org');return Object.fromEntries(FACETS.map(({key})=>[key,key==='pmid'?clean(parsed.searchParams.get(key)):normalize(parsed.searchParams.get(key))]));}
  function toURL(url,filters,site){const parsed=new URL(url,'https://oglcnac.org');for(const {key}of FACETS){if(filters[key])parsed.searchParams.set(key,filters[key]);else parsed.searchParams.delete(key);}if(site)parsed.searchParams.set('site',String(site));else parsed.searchParams.delete('site');return parsed;}
  function citation(paper){
    if(!paper||paper.status!=='verified')return paper?.pmid?`PMID: ${paper.pmid}. https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`:'';
    const parts=[];if(paper.authors?.length)parts.push(paper.authors.join(', ')+'.');
    parts.push(paper.title.replace(/\.*$/,'')+'.');
    const journal=[paper.journal_short||paper.journal,paper.date].filter(Boolean).join('. ');
    const volume=paper.volume?`${paper.volume}${paper.issue?`(${paper.issue})`:''}${paper.pages?':'+paper.pages:''}`:paper.pages||'';
    if(journal||volume)parts.push([journal,volume].filter(Boolean).join('; ')+'.');
    if(paper.doi)parts.push('doi: '+paper.doi+'.');parts.push('PMID: '+paper.pmid+'.');return parts.join(' ');
  }
  function authorLabel(paper){if(!paper?.authors?.length)return '';return paper.authors.slice(0,3).join(', ')+(paper.authors.length>3?', et al.':'');}
  function bucket(accession){let value=2166136261;for(const c of accession)value=Math.imul(value^c.codePointAt(0),16777619)>>>0;return(value&255).toString(16).padStart(2,'0');}
  const requests=new Map();
  function json(path){if(!requests.has(path)){const task=browser.fetch(path).then(response=>{if(!response.ok)throw Error('Metadata unavailable');return response.json();}).catch(error=>{requests.delete(path);throw error;});requests.set(path,task);}return requests.get(path);}
  async function load(accession){
    const manifest=await json('/static/data/atlas-enrichment/manifest.json');
    if(manifest.schema_version!==1||typeof manifest.revision!=='string')throw Error('Unsupported metadata snapshot');
    const version=encodeURIComponent(manifest.revision);
    const [publications,protein]=await Promise.allSettled([json(`/static/data/atlas-enrichment/publications.json?v=${version}`),json(`/static/data/atlas-enrichment/proteins/${bucket(accession)}.json?v=${version}`)]);
    return {manifest,publications:publications.status==='fulfilled'?publications.value.publications:{},publicationsState:publications.status==='fulfilled'?'ready':'unavailable',protein:protein.status==='fulfilled'?protein.value.proteins[accession]||null:null};
  }
  async function loadPublications(){
    const manifest=await json('/static/data/atlas-enrichment/manifest.json');
    const payload=await json(`/static/data/atlas-enrichment/publications.json?v=${encodeURIComponent(manifest.revision)}`);
    return payload.publications;
  }
  function create(element,options){
    const records=options.records;let filters=fromURL(browser.location.href),site=null,selection=null,papers={},metadataState='loading';
    element.innerHTML='<div class="evidence-filter-heading"><h2>Explore the evidence</h2><button type="button" data-evidence="reset">Reset view</button></div><div class="evidence-filter-fields"></div><div class="evidence-filter-footer"><p data-evidence="summary" role="status" aria-live="polite"></p><button type="button" data-evidence="download">Download matching records</button></div>';
    const fields=element.querySelector('.evidence-filter-fields');const selects={};
    for(const facet of FACETS){const label=browser.document.createElement('label');label.htmlFor='atlas-filter-'+facet.key;label.textContent=facet.label;const select=browser.document.createElement('select');select.id=label.htmlFor;selects[facet.key]=select;label.append(select);fields.append(label);select.addEventListener('change',()=>{filters[facet.key]=select.value;push();render();});}
    function push(hash){const url=toURL(browser.location.href,filters,site);if(hash)url.hash=hash;if(url.href!==browser.location.href)browser.history.pushState(null,'',url);}
    function render(){
      const matches=filter(records,filters,site,'',papers),base=filter(records,filters,null,'',papers),counts=facets(records,filters,site,papers),active=FACETS.some(f=>filters[f.key]);
      for(const facet of FACETS){
        const select=selects[facet.key],wanted=[{value:'',label:'All '+({method:'methods',sample:'sample types',ambiguity:'assignments',pmid:'publications',year:'publication years'}[facet.key])},...counts[facet.key].map(item=>{
          const paper=facet.key==='pmid'?papers[item.value]:null;
          const label=paper?.status==='verified'?`${paper.authors?.[0]||'PMID '+item.value}${paper.authors?.length>1?' et al.':''}${paper.year?' · '+paper.year:''} · PMID ${item.value}`:item.label;
          return {value:item.value,label:`${label} (${item.count})`};
        })];
        const old=new Map([...select.options].map(option=>[option.value,option]));
        for(const item of wanted){let option=old.get(item.value);if(!option){option=browser.document.createElement('option');option.value=item.value;}option.textContent=item.label;select.append(option);old.delete(item.value);}for(const option of old.values())option.remove();select.value=filters[facet.key]||'';
      }
      element.querySelector('[data-evidence="summary"]').textContent=`${matches.length.toLocaleString()} of ${records.length.toLocaleString()} source records${site?' · Position '+site:''} · ${pmids(matches).length} publications${!matches.length?' · No records match this combination.':''}`;
      element.querySelector('[data-evidence="reset"]').disabled=!active&&!site;
      element.querySelector('[data-evidence="download"]').disabled=!matches.length;
      renderPublications(matches);
      options.onChange({records:matches,baseRecords:base,filters:{...filters},position:site,site:selection?.site,active});
    }
    let lastPublicationRows,lastPapers,lastMetadataState;
    function renderPublications(matches){
      if(lastPapers===papers&&lastMetadataState===metadataState&&lastPublicationRows?.length===matches.length&&lastPublicationRows.every((r,i)=>r===matches[i]))return;
      lastPapers=papers;lastMetadataState=metadataState;lastPublicationRows=matches;
      const list=options.publicationList;const focused=browser.document.activeElement;const focusPmid=focused?.closest('.atlas-citation')?.dataset.pmid;const focusAction=focused?.textContent;list.replaceChildren();const identifiers=pmids(matches);
      options.publicationSummary.textContent=`${identifiers.length} source ${identifiers.length===1?'publication':'publications'} linked to ${matches.length} matching ${matches.length===1?'record':'records'}.`;
      options.publicationStatus.textContent=metadataState==='loading'?'Loading publication details…':metadataState==='unavailable'?'Publication details are unavailable. Original PMID links and evidence remain accessible.':'Titles and citation details from a locally cached PubMed snapshot.';
      for(const pmid of identifiers){
        const paper=papers[pmid];const known=paper?.status==='verified';const rows=matches.filter(row=>pmids([row]).includes(pmid));const positions=new Set(rows.map(row=>coordinate(row.position_in_protein)).filter(Boolean));
        const item=browser.document.createElement('li');item.className='atlas-citation';item.dataset.pmid=pmid;
        const content=browser.document.createElement('div');content.className='atlas-citation-content';
        const title=browser.document.createElement('h3');const link=browser.document.createElement('a');link.href=`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;link.textContent=known?paper.title:`PMID ${pmid}`;title.append(link);content.append(title);
        const details=browser.document.createElement('p');details.className='atlas-citation-metadata';details.textContent=known?[authorLabel(paper),paper.journal_short||paper.journal,paper.date].filter(Boolean).join(' · '):metadataState==='loading'?'Loading citation details…':'Citation details are not available in this snapshot.';content.append(details);
        const support=browser.document.createElement('p');support.className='atlas-citation-support';support.textContent=`${rows.length} ${rows.length===1?'record':'records'} · ${positions.size} reported numeric ${positions.size===1?'position':'positions'}`;content.append(support);
        const identifiersLine=browser.document.createElement('p');identifiersLine.className='atlas-citation-identifiers';identifiersLine.append(browser.document.createTextNode(`PMID ${pmid}`));
        if(known&&/^10\.\d{4,9}\/\S+$/.test(paper.doi||'')){const doi=browser.document.createElement('a');doi.href='https://doi.org/'+encodeURI(paper.doi).replace(/#/g,'%23').replace(/\?/g,'%3F');doi.textContent='DOI: '+paper.doi;identifiersLine.append(browser.document.createTextNode(' · '),doi);}content.append(identifiersLine);
        const actions=browser.document.createElement('div');actions.className='atlas-citation-actions';
        const evidence=browser.document.createElement('button');evidence.type='button';evidence.textContent='View evidence';evidence.setAttribute('aria-label',`View ${rows.length} evidence records for PMID ${pmid}`);evidence.addEventListener('click',()=>{filters.pmid=pmid;push('atlas-evidence');render();browser.document.getElementById('atlas-evidence').scrollIntoView({block:'start'});browser.document.getElementById('atlas-evidence-heading').focus({preventScroll:true});});
        const copy=browser.document.createElement('button');copy.type='button';copy.textContent=known?'Copy citation':'Copy PMID link';copy.setAttribute('aria-label',`${copy.textContent} for PMID ${pmid}`);copy.addEventListener('click',async()=>{const ok=await browser.OglcnacProteinViewer.copyText(citation(known?paper:{pmid}));options.publicationStatus.textContent=ok?`Citation for PMID ${pmid} copied.`:'Copying is unavailable in this browser. Open the PMID link for citation details.';});
        const study=browser.document.createElement('a');study.href='/atlas/study/?pmid='+pmid;study.textContent='Explore this study';actions.append(evidence,copy,study);item.append(content,actions);list.append(item);
        if(focusPmid===pmid){const target=focusAction?.startsWith('Copy')?copy:evidence;target.focus({preventScroll:true});}
      }
    }
    function history(){filters=fromURL(browser.location.href);site=coordinate(new URL(browser.location.href).searchParams.get('site'));if(!records.some(row=>coordinate(row.position_in_protein)===site))site=null;render();}
    element.querySelector('[data-evidence="reset"]').addEventListener('click',()=>{filters=Object.fromEntries(FACETS.map(f=>[f.key,'']));site=null;push();options.onReset();render();});
    element.querySelector('[data-evidence="download"]').addEventListener('click',()=>options.onDownload(filter(records,filters,site,'',papers)));
    browser.addEventListener('popstate',history);
    return {setSelection(value){selection=value;site=value.position;render();},setMetadata(value){papers=value.publications||{};metadataState=value.publicationsState||'unavailable';render();},getFilters(){return{...filters};},destroy(){browser.removeEventListener('popstate',history);}};
  }
  return {EMPTY,FACETS,normalize,coordinate,pmids,filter,facets,fromURL,toURL,citation,authorLabel,bucket,load,loadPublications,create};
});
