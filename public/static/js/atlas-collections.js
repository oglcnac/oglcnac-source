(function(){
  'use strict';
  const T=OglcnacAtlasTools,D=OglcnacStaticData,V=OglcnacRecordView,el=id=>document.getElementById(id),store=T.collectionStore(),selected=new Set();
  const table=OglcnacTables.create('collection_table',{label:'Collection proteins',filename:'atlas-collection.csv',mobileColumns:[0,1,2,3,4]});
  let active=new URLSearchParams(location.search).get('collection')||'',epoch=0,lastUndo=null;
  const status=text=>{el('collections-status').textContent=text;};
  function selection(){el('collection-selection').textContent=`${selected.size} selected. Choose 2–4 to compare.`;el('collection-compare').disabled=selected.size<2||selected.size>4;el('collection-remove').disabled=!selected.size;document.querySelectorAll('[data-select-accession]').forEach(input=>{input.checked=selected.has(input.dataset.selectAccession);});}
  function save(fn,message){try{store.update(fn);status(message);render();return true;}catch(e){status(e.message);return false;}}
  function setActive(id,push=true){active=id;selected.clear();const params=new URLSearchParams();if(id)params.set('collection',id);const url=location.pathname+(params.size?'?'+params:'');if(push&&url!==location.pathname+location.search)history.pushState(null,'',url);el('collection-confirm').hidden=true;render();}
  async function render(){
    const generation=++epoch;let data;try{data=store.read();el('collections-export').disabled=false;}catch(e){status(e.message);el('collections-export').disabled=true;return;}
    const list=el('collection-list');list.replaceChildren();if(!data.collections.length)list.append(T.node('p','No saved collections yet.'));
    if(!active&&data.collections.length)active=data.collections[0].id;
    for(const c of data.collections){const button=T.node('button',`${c.name} · ${c.accessions.length}`,{type:'button','aria-current':String(c.id===active)});button.addEventListener('click',()=>setActive(c.id));list.append(button);}
    const collection=data.collections.find(c=>c.id===active);el('collection-tools').hidden=!collection;el('collection-empty').hidden=!!collection;
    if(!collection){el('collection-title').textContent=data.collections.length?'Choose a collection':'Your research starts with a few proteins';return;}
    selected.forEach(id=>{if(!collection.accessions.includes(id))selected.delete(id);});selection();el('collection-title').textContent=collection.name;el('collection-name').value=collection.name;el('collection-summary').textContent=`${collection.accessions.length} saved accessions · Updated ${new Date(collection.updated).toLocaleDateString()}`;el('collection-search').href='/atlas/search/?ids='+encodeURIComponent(collection.accessions.join(','));el('collection-search').hidden=!collection.accessions.length;
    table.setLoading('Loading saved proteins…');
    try{const rows=collection.accessions.length?await D.loadAtlasProjection():[];if(generation!==epoch)return;const wanted=new Set(collection.accessions.map(id=>id.toUpperCase())),groups=V.groupProteins(rows.filter(r=>wanted.has(r.accession.toUpperCase()))),byId=new Map();for(const p of groups){const key=p.accession.toUpperCase();if(!byId.has(key))byId.set(key,[]);byId.get(key).push(p);}
      table.setRows(collection.accessions.map(id=>{const matches=byId.get(id.toUpperCase())||[];return[T.selectionCell(id,selected,selection),{text:id,href:T.detailURL(matches[0]?.accession||id)},matches[0]?.protein_name||'Not found in this Atlas release',matches.map(p=>p.species).join(' / ')||'—',matches.reduce((sum,p)=>sum+p.recordCount,0)];}));selection();
    }catch(e){if(generation===epoch)table.setError('Protein metadata could not be loaded. Saved accessions are retained; choose the collection again to retry.');}
  }
  el('collection-create').addEventListener('submit',event=>{event.preventDefault();const id=T.id();if(save(data=>{data.collections.push({id,name:el('collection-new-name').value,accessions:[],updated:new Date().toISOString()});return data;},'Collection created.')){el('collection-new-name').value='';setActive(id);}});
  el('collection-rename').addEventListener('submit',event=>{event.preventDefault();save(data=>{const c=data.collections.find(c=>c.id===active);if(!c)throw Error('Collection no longer exists.');c.name=el('collection-name').value;c.updated=new Date().toISOString();return data;},'Collection renamed.');});
  el('collection-select-all').addEventListener('click',()=>{try{store.read().collections.find(c=>c.id===active)?.accessions.forEach(id=>selected.add(id));selection();}catch(e){status(e.message);}});
  el('collection-clear').addEventListener('click',()=>{selected.clear();selection();});
  el('collection-compare').addEventListener('click',()=>{if(selected.size>=2&&selected.size<=4)location.href=T.compareURL([...selected]);});
  el('collection-remove').addEventListener('click',()=>{const ids=[...selected],target=active;if(save(data=>{const c=data.collections.find(c=>c.id===target);if(!c)throw Error('Collection no longer exists.');c.accessions=c.accessions.filter(id=>!selected.has(id));c.updated=new Date().toISOString();return data;},`${ids.length} proteins removed. You can undo this removal.`)){lastUndo={target,ids};selected.clear();el('collection-undo').hidden=false;}});
  el('collection-delete').addEventListener('click',()=>{el('collection-confirm').hidden=false;el('collection-delete-cancel').focus();});
  el('collection-delete-cancel').addEventListener('click',()=>{el('collection-confirm').hidden=true;el('collection-delete').focus();});
  el('collection-delete-confirm').addEventListener('click',()=>{let removed;if(save(data=>{removed=data.collections.find(c=>c.id===active);if(!removed)throw Error('Collection no longer exists.');data.collections=data.collections.filter(c=>c.id!==active);return data;},'Collection deleted. You can undo this deletion.')){lastUndo={collection:removed};el('collection-undo').hidden=false;setActive('');}});
  el('collection-undo').addEventListener('click',()=>{if(!lastUndo)return;const undo=lastUndo;if(save(data=>{if(undo.collection)return T.mergeCollections(data,{kind:'oglcnac-collections',schema_version:1,collections:[undo.collection]});const c=data.collections.find(c=>c.id===undo.target);if(!c)throw Error('The original collection no longer exists.');c.accessions=T.unique([...c.accessions,...undo.ids]);c.updated=new Date().toISOString();return data;},'Removal undone.')){lastUndo=null;el('collection-undo').hidden=true;}});
  el('collections-export').addEventListener('click',()=>{try{T.download('atlas-collections.json',store.read());status('Collection backup exported.');}catch(e){status(e.message);}});
  el('collections-import').addEventListener('change',async event=>{try{const input=JSON.parse(await T.readFile(event.target.files[0],16*1024*1024));store.update(data=>T.mergeCollections(data,input));status('Backup restored. Existing collections were preserved.');render();}catch(e){status(e.message);}finally{event.target.value='';}});
  addEventListener('storage',event=>{if(event.key===T.COLLECTION_KEY)render();});addEventListener('popstate',()=>setActive(new URLSearchParams(location.search).get('collection')||'',false));render();
})();
