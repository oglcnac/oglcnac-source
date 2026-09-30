(function(){
  'use strict';
  const R=OglcnacResearch,T=OglcnacAtlasTools,input=document.getElementById('atlas-search-term'),field=document.getElementById('atlas-search-field');
  const host=input.parentElement;host.classList.add('atlas-autocomplete');
  const list=T.node('ul',undefined,{id:'atlas-suggestions',role:'listbox','aria-label':'Suggested Atlas proteins',class:'atlas-suggestions'}),status=T.node('p','Suggestions use reported Atlas names. Choose a protein or search the selected field.',{id:'atlas-suggestion-status',class:'atlas-suggestion-status',role:'status'});
  host.append(list,status);list.hidden=true;
  for(const [key,value]of Object.entries({role:'combobox','aria-autocomplete':'list','aria-expanded':'false','aria-controls':list.id,'aria-describedby':status.id}))input.setAttribute(key,value);
  let items=[],active=-1,epoch=0,timer;
  function close(){status.removeAttribute('data-visible');list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function choose(index){const item=items[index];if(!item)return;close();input.value=item.accession;field.value='accession';document.getElementById('atlas-search-form').requestSubmit();}
  function highlight(index){active=index;[...list.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  async function update(){
    const current=++epoch,q=input.value.trim();close();
    if(!q||['peptide_seq','species'].includes(field.value)){status.textContent='Suggestions use reported accession, gene and protein names.';return;}
    status.textContent='Finding matching proteins…';
    try{const data=await R.catalog('proteins');if(current!==epoch||document.activeElement!==input)return;items=R.suggestions(data.proteins,q);list.replaceChildren();
      items.forEach((item,index)=>{const node=T.node('li',undefined,{id:'atlas-suggestion-'+index,role:'option','aria-selected':'false'});node.append(T.node('strong',item.accession),T.node('span',item.genes.join(' / ')||'Gene not reported',{class:'suggestion-gene'}),T.node('span',item.names[0]||'Protein name not reported',{class:'suggestion-name'}),T.node('small',`${item.species.join(' / ')||'Species not reported'} · ${item.match}`));node.addEventListener('pointerdown',event=>event.preventDefault());node.addEventListener('click',()=>choose(index));list.append(node);});
      list.hidden=!items.length;input.setAttribute('aria-expanded',String(!!items.length));status.textContent=items.length?`${items.length} suggestions. Check accession and species; names can refer to several proteins. Use ↑ and ↓ to choose.`:'No suggestions. You can still search the selected field.';if(!items.length)status.dataset.visible='true';
    }catch(_){if(current===epoch){status.textContent='Suggestions unavailable. Search remains available; type again to retry.';status.dataset.visible='true';}}
  }
  input.addEventListener('input',()=>{++epoch;close();clearTimeout(timer);timer=setTimeout(update,120);});
  input.addEventListener('focus',()=>{if(input.value.trim())update();});
  field.addEventListener('change',()=>{++epoch;close();});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){++epoch;clearTimeout(timer);close();return;}
    if(event.key==='Tab'){close();return;}
    if(list.hidden)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight(event.key==='ArrowDown'?(active+1)%items.length:(active<0?items.length-1:(active-1+items.length)%items.length));}
    if(event.key==='Enter'&&active>=0){event.preventDefault();choose(active);}
  });
  input.addEventListener('blur',()=>{++epoch;clearTimeout(timer);close();});
  document.getElementById('atlas-search-form').addEventListener('submit',()=>{++epoch;clearTimeout(timer);close();});
})();
