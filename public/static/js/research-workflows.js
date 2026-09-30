(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OglcnacResearch=api;})(typeof window==='undefined'?globalThis:window,function(root){
  'use strict';
  const norm=value=>String(value??'').trim().toLowerCase();
  const unique=values=>[...new Set(values)];
  const pmids=rows=>unique(rows.flatMap(row=>String(row.pmid??'').match(/\b\d{6,9}\b/g)||[]));
  const tasks=new Map();
  function json(path){if(!tasks.has(path))tasks.set(path,root.fetch(path).then(r=>{if(!r.ok)throw Error('Research metadata could not be loaded. Try again.');return r.json();}).catch(()=>{tasks.delete(path);throw Error('Research metadata could not be loaded. Check your connection and try again.');}));return tasks.get(path);}
  async function catalog(name){const manifest=await json('/static/data/atlas-research/manifest.json');const data=await json(`/static/data/atlas-research/${name}.json?v=${manifest.revision}`);return {manifest,...data};}
  function suggestions(proteins,query,limit=8){
    const q=norm(query);if(!q)return [];
    return proteins.flatMap(protein=>{
      const accession=norm(protein.accession),genes=protein.genes.flatMap(g=>norm(g).split(/[\s;,/]+/)),names=protein.names.map(norm);
      const score=accession===q?0:genes.includes(q)?1:accession.startsWith(q)?2:genes.some(g=>g.startsWith(q))?3:names.some(n=>n===q)?4:names.some(n=>n.startsWith(q))?5:names.some(n=>n.includes(q))||protein.genes.some(g=>norm(g).includes(q))?6:99;
      return score===99?[]:[{...protein,score,match:score===0?'Exact accession':score===1?'Exact reported gene':score===2?'Accession':score===3||protein.genes.some(g=>norm(g).includes(q))?'Reported gene':'Protein name'}];
    }).sort((a,b)=>a.score-b.score||a.accession.localeCompare(b.accession)).slice(0,limit);
  }
  function species(value){const s=norm(value);return s==='human'||s==='homo sapiens'?'human':s==='mouse'||s==='mus musculus'?'mouse':s;}
  function preparation(ids,records,snapshot){
    return ids.map(accession=>{
      const rows=records.filter(row=>norm(row.accession)===norm(accession));
      const exact=rows[0]?.accession||accession,organisms=unique(rows.map(row=>species(row.species))),sequence=snapshot.sequences?.[exact]||'';
      let status='Ready';
      if(!rows.length)status='No exact Atlas record';
      else if(organisms.length!==1||!organisms[0])status='Species is missing or ambiguous';
      else if(!['human','mouse'].includes(organisms[0]))status='No model for this species';
      else if(!sequence)status='No exact sequence in the local snapshot';
      else if(!(organisms[0]==='human'?/^[ARNDCQEGHILKMFPSTWYVXU]+$/:/^[ARNDCQEGHILKMFPSTWYVX]+$/).test(sequence))status='Sequence contains residues unsupported by this model';
      else if(!/[ST]/.test(sequence))status='No S/T candidate residues';
      else if(sequence.length+exact.length+20>200000)status='Sequence exceeds the analysis input limit';
      return {accession:exact,species:organisms.join(' / ')||'Not reported',length:sequence.length,status,sequence:status==='Ready'?sequence:''};
    });
  }
  function fasta(rows){return rows.map(r=>`>${r.accession||r.id}\n${r.sequence.match(/.{1,80}/g)?.join('\n')||''}`).join('\n')+'\n';}
  function prepareFasta(plan,model){const included=plan.filter(row=>row.status==='Ready'&&row.species===model);if(!included.length)throw Error('No compatible sequences are available for this model.');const text=fasta(included);if(text.length>200000)throw Error('This species group exceeds the 200,000-character input limit. Select fewer proteins in the collection; no partial group was prepared.');return {text,included};}
  function analysisURL(ids){return '/analysis/?ids='+encodeURIComponent(ids.join(','));}
  function studyURL(pmid){return '/atlas/study/?pmid='+encodeURIComponent(pmid);}
  function studyRows(rows,pmid){return rows.filter(row=>pmids([row]).includes(pmid));}
  function studySummary(rows){const positions=new Set();for(const row of rows){const raw=String(row.position_in_protein??'').trim();if(row.accession&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0)positions.add(JSON.stringify([row.accession,row.species,Number(raw)]));}return {records:rows.length,proteins:unique(rows.map(r=>r.accession).filter(Boolean)).length,positions:positions.size,missing_accessions:rows.filter(r=>!r.accession).length};}
  function csv(rows){const fields=unique(rows.flatMap(row=>Object.keys(row)));const cell=value=>{const s=Array.isArray(value)?value.join('; '):String(value??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};return [fields.join(','),...rows.map(row=>fields.map(f=>cell(row[f])).join(','))].join('\n');}
  const encoder=new TextEncoder();
  const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function zip(files){
    const local=[],central=[];let offset=0,centralSize=0;
    for(const [filename,value] of Object.entries(files)){
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(filename))throw Error('Invalid report filename.');
      const name=encoder.encode(filename),body=typeof value==='string'?encoder.encode(value):value,crc=crc32(body);
      const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);v.setUint16(26,name.length,true);header.set(name,30);local.push(header,body);
      const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=header.length+body.length;centralSize+=c.length;
    }
    const end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,central.length,true);d.setUint16(10,central.length,true);d.setUint32(12,centralSize,true);d.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }
  async function sha256(value){const bytes=typeof value==='string'?encoder.encode(value):value;return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function report({kind,metadata,files}){
    const entries={...files};entries['README.txt']=`O-GlcNAc research report\nReport type: ${kind}\n\nmanifest.json describes the captured scope, versions and file SHA-256 checksums.\nResults and source evidence are separate. Predictions are not experimental evidence.\nFiltered files capture the named filters; complete files retain the whole completed analysis or protein record.\nInput FASTA and parameters refer to the completed run, even if the input form was subsequently edited.\nDataset hashes identify the original full data files. File checksums cover the exported subsets.\n${kind==='workbench-analysis'?'Model weights are not bundled: model-manifest.json records their paths and hashes for independent retrieval.':'This report contains experimental Atlas records. No prediction model was used.'}\nCitation metadata availability and sequence/annotation verification are recorded explicitly.\nUse UTF-8 and preserve original accession, species and one-based residue coordinates.\nSource evidence is unchanged; residue conflicts are not corrected by this report.\n\nOpen JSON in a text editor or analysis program and CSV in a spreadsheet.\nGenerated locally by oglcnac.org. This archive may contain your private input sequences.\n`;
    const checksums={};for(const [name,content]of Object.entries(entries))checksums[name]={sha256:await sha256(content),bytes:typeof content==='string'?encoder.encode(content).length:content.length};
    entries['manifest.json']=JSON.stringify({schema_version:1,kind,exported_at:new Date().toISOString(),...metadata,files:checksums},null,2);
    return zip(entries);
  }
  function download(name,content,type){const blob=content instanceof Blob?content:new Blob([content],{type:type||'text/plain;charset=utf-8'}),url=root.URL.createObjectURL(blob),link=root.document.createElement('a');link.href=url;link.download=name;root.document.body.append(link);link.click();link.remove();setTimeout(()=>root.URL.revokeObjectURL(url),1000);}
  return {norm,unique,pmids,json,catalog,suggestions,species,preparation,prepareFasta,fasta,analysisURL,studyURL,studyRows,studySummary,csv,crc32,zip,sha256,report,download};
});
