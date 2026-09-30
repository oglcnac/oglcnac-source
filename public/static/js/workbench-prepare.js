(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const R=OglcnacResearch,T=OglcnacAtlasTools,D=OglcnacStaticData,el=id=>document.getElementById(id),params=new URLSearchParams(location.search);
    if(!params.has('ids'))return;
    const panel=el('workbench-preparation');panel.hidden=false;let plan=[],version=0;
    const table=OglcnacTables.create('preparation_table',{label:'Sequence preparation',filename:'sequence-preparation.csv',mobileColumns:[0,1,2,3]});
    async function load(){
      const current=++version;el('preparation-retry').hidden=true;el('preparation-actions').replaceChildren();el('preparation-status').textContent='Checking exact accessions, species and locally available sequences…';table.setLoading('Preparing sequence choices…');
      try{const parsed=T.parseBatch(params.get('ids'));if(parsed.some(row=>!T.accession(row.input)))throw Error('The preparation URL contains an invalid accession. Use an Atlas protein or collection link.');
        const ids=R.unique((await D.resolveAtlasAccessions(parsed.map(row=>row.input))).map(String));
        const [records,snapshot]=await Promise.all([D.loadAtlasRecordsForAccessions(ids),D.loadAtlasSequenceSnapshotForAccessions(ids)]);if(current!==version)return;
        plan=R.preparation(ids,records,snapshot);window.oglcnacPreparation={requested:ids,outcomes:plan.map(({sequence,...rest})=>rest)};
        table.setRows(plan.map(row=>[{text:row.accession,href:T.detailURL(row.accession)},row.species,row.length||'Unavailable',row.status]));
        const ready=plan.filter(row=>row.status==='Ready');el('preparation-status').textContent=`${ready.length} of ${plan.length} proteins have compatible sequences. Prepare a species group below, inspect its FASTA, then run the analysis.`;
        for(const model of ['human','mouse']){const count=ready.filter(row=>row.species===model).length;if(!count)continue;const button=T.node('button',`Prepare ${model} (${count})`,{type:'button',id:'prepare-'+model});button.addEventListener('click',event=>{
          try{const prepared=R.prepareFasta(plan,model);if(el('workbench-fasta').readOnly)throw Error('Finish or cancel the current analysis before preparing another group.');el('workbench-paste-mode').click();el('workbench-fasta').value=prepared.text;el('workbench-species').value=model;window.oglcnacPreparation.selected_species=model;window.oglcnacPreparation.included=prepared.included.map(r=>r.accession);el('preparation-status').textContent=`Prepared ${prepared.included.length} ${model} proteins. ${plan.length-prepared.included.length} requested proteins are outside this group; all outcomes are listed below. Review FASTA before running.`;if(event.isTrusted)el('workbench-fasta').focus();}catch(error){el('preparation-status').textContent=error.message;}
        });el('preparation-actions').append(button);}
        if(ready.length===plan.length&&R.unique(ready.map(row=>row.species)).length===1&&!el('workbench-fasta').value&&!el('workbench-fasta').readOnly)el('prepare-'+ready[0].species).click();
        panel.dataset.ready='true';
      }catch(error){if(current!==version)return;table.setError('Sequence preparation is unavailable. Manual FASTA input remains available.');el('preparation-status').textContent=error.message;el('preparation-retry').hidden=false;}
    }
    el('preparation-retry').addEventListener('click',load);load();
  });
})();
