'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const output=process.env.REVIEW_OUTPUT;if(!output)throw Error('Set REVIEW_OUTPUT.');let base=process.env.REVIEW_BASE_URL,server;
const cases=[
 {name:'suggestions',url:'/atlas/search/',target:'#atlas-search-form'},
 {name:'directory',url:'/atlas/publications/',target:'.atlas-tools-heading'},
 {name:'directory-empty',url:'/atlas/publications/?q=NoSuchStudyExample',target:'.atlas-tools-heading'},
 {name:'study',url:'/atlas/study/?pmid=20068230',target:'.atlas-tools-heading'},
 {name:'study-evidence',url:'/atlas/study/?pmid=20068230',target:'#study-content'},
 {name:'study-missing',url:'/atlas/study/?pmid=99999999',target:'.atlas-tools-heading'},
 {name:'collections',url:'/atlas/collections/',target:'#collection-tools'},
 {name:'preparation',url:'/analysis/?ids=P12270,P18583,Q6UN15-1,MISSING',target:'#workbench-preparation'},
 {name:'preparation-mixed',url:'/analysis/?ids=P12270,Q8CGY8',target:'#workbench-preparation'},
 {name:'preparation-missing',url:'/analysis/?ids=Q6UN15-1,MISSING',target:'#workbench-preparation'},
 {name:'record-actions',url:'/atlas/detail/?id=P12270',target:'#atlas-overview'},
 {name:'prepared-input',url:'/analysis/?ids=P12270',target:'#workbench-form'},
 {name:'figure-full',url:'/atlas/detail/?id=P12270',target:'#atlas-figure-export'},
 {name:'figure-region',url:'/atlas/detail/?id=P49792&site=868',target:'#atlas-figure-export'},
 {name:'figure-missing',url:'/atlas/detail/?id=LOC_Os01g20110.1',target:'#atlas-figure-export'},
 {name:'workbench-report',url:'/analysis/',target:'#workbench-results'}
];
const collection={kind:'oglcnac-collections',schema_version:1,collections:[{id:'visual-example',name:'Nuclear proteins',accessions:['P12270','P18583','Q6UN15-1'],updated:'2026-09-30T12:00:00Z'}]};
(async()=>{
 if(!base){const http=require('node:http'),root=process.env.SITE_STATIC_ROOT||path.join(__dirname,'../dist-public');server=http.createServer(async(req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(file,'index.html');try{const body=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch(_){res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;}
 await fs.mkdir(output,{recursive:true});const browser=await chromium.launch();const captures=[];
 try{for(const width of [320,390,768,1440,1920])for(const item of cases){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(data=>localStorage.setItem('oglcnac:collections:v1',JSON.stringify(data)),collection);await page.goto(base+item.url);await page.addStyleTag({content:'html {scroll-behavior:auto !important;}'});
  if(item.name==='suggestions'){await page.fill('#atlas-search-term','OGT');await page.waitForSelector('#atlas-suggestions:not([hidden])');await page.locator('#atlas-search-term').press('ArrowDown');}
  else if(item.name.startsWith('directory'))await page.waitForSelector('#studies-list[data-ready=true]');
  else if(item.name==='study-missing')await page.waitForSelector('#study-retry:not([hidden])');
  else if(item.name.startsWith('study')){await page.waitForSelector('#study-content[data-ready=true]');if(item.name==='study-evidence'){await page.locator('.study-context details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));await page.locator('#study-select-all').click();}}
  else if(item.name==='collections'){await page.waitForFunction(()=>OglcnacTables.get('collection_table').totalRows===3);await page.locator('#collection-select-all').click();}
  else if(item.name==='record-actions')await page.waitForSelector('#atlas-feature-viewer[data-state]');
  else if(item.name==='prepared-input')await page.waitForSelector('#workbench-preparation[data-ready=true]');
  else if(item.name.startsWith('preparation')){await page.waitForSelector('#workbench-preparation[data-ready=true]');await page.locator('.preparation-outcomes').evaluate(n=>n.open=true);}
  else if(item.name.startsWith('figure')){
   await page.waitForSelector('#atlas-feature-viewer[data-state]');await page.locator('#atlas-figure-export').evaluate(n=>n.open=true);await page.waitForTimeout(50);
   if(item.name==='figure-region'){await page.fill('#figure-start','700');await page.fill('#figure-end','900');}
   await page.locator('#figure-preview-button').click();await page.waitForFunction(()=>/Preview ready|required/.test(document.getElementById('figure-status').textContent));
   if(width===1440&&item.name!=='figure-missing'){for(const format of ['svg','png']){const pending=page.waitForEvent('download');await page.locator('#figure-'+format).click();await(await pending).saveAs(path.join(output,item.name+'.'+format));}}
  }else if(item.name==='workbench-report'){
   await page.locator('#workbench-sample').click();await page.locator('#workbench-form button[type=submit]').click();await page.waitForSelector('#workbench-results:not([hidden])',{timeout:120000});await page.selectOption('#workbench-evidence-filter','atlas');await page.locator('#workbench-evidence-links details').evaluate(n=>n.open=true);const pending=page.waitForEvent('download');await page.locator('#workbench-report').click();await(await pending).saveAs(path.join(output,width+'-workbench-report.zip'));
  }
  await page.locator(item.target).evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForTimeout(80);
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('main button,main select,main input:not([type=checkbox])')].filter(n=>n.getClientRects().length&&!n.closest('.table-scroll,.native-table-controls,.native-table-footer,.record-section-nav')).map(n=>({id:n.id,text:n.textContent.slice(0,50),left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,height:n.getBoundingClientRect().height}))}));
  assert.ok(geometry.scrollWidth<=width,`${item.name} page overflow at ${width}`);assert.deepEqual(errors,[]);assert.ok(geometry.controls.every(n=>n.left>=-1&&n.right<=width+1),`${item.name} clipped controls at ${width}: `+JSON.stringify(geometry.controls.filter(n=>n.left< -1||n.right>width+1)));
  const filename=`${width}-${item.name}.png`;await page.screenshot({path:path.join(output,filename)});captures.push({width,case:item.name,filename,geometry,errors});console.log(filename);await context.close();
 }}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
 await fs.writeFile(path.join(output,'review.json'),JSON.stringify({base,created:new Date().toISOString(),captures},null,2)+'\n');
})();
