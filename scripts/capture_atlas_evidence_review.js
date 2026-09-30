'use strict';
// Review against a running static preview or live site. Outputs stay outside source assets.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let base=process.env.REVIEW_BASE_URL;
let server;
const output=process.env.REVIEW_OUTPUT;
if(!output)throw Error('Set REVIEW_OUTPUT to an artifact directory');
const cases=[
 {name:'overview',id:'P12270',target:'#atlas-overview'},
 {name:'filters',id:'P12270',query:'&site=1676&ambiguity=unambiguous',target:'#atlas-filters'},
 {name:'publications',id:'P12270',target:'#atlas-publications'},
 {name:'features',id:'O15294',target:'#atlas-features',select:true},
 {name:'sparse',id:'P08154',target:'#atlas-features'},
 {name:'missing-sequence',id:'62658155',target:'#atlas-features'},
 {name:'residue-mismatch',id:'P49792',query:'&site=868',target:'#atlas-features'},
 {name:'missing-publications',id:'P12270',target:'#atlas-publications',missing:true},
 {name:'changed-sequence',id:'P12270',target:'#atlas-features',changed:true}
];
(async()=>{
if(!base){const http=require('node:http');const root=process.env.SITE_STATIC_ROOT||path.join(__dirname,'../dist-public');server=http.createServer(async(req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(file,'index.html');try{const body=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch(_){res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;}
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch();const result=[];
try{for(const width of [320,390,768,1440,1920])for(const item of cases){
 const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(item.missing)await page.route('**/atlas-enrichment/publications.json*',route=>route.abort());
 if(item.changed)await page.route('**/atlas-enrichment/proteins/*.json*',async route=>{const response=await route.fetch();const payload=await response.json();payload.proteins.P12270.source_sha256='changed';await route.fulfill({response,json:payload});});
 await page.goto(`${base}/atlas/detail/?id=${item.id}${item.query||''}`);await page.waitForSelector('#atlas-feature-viewer[data-state]');await page.addStyleTag({content:'html { scroll-behavior:auto !important; }'});
 if(item.select)await page.selectOption('#atlas-feature-select','0');
 if(width<901)await page.locator('.record-section-nav details').evaluate(n=>n.open=false);
 await page.locator(item.target).evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForTimeout(150);
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('#atlas-filters select,#atlas-filters button,#atlas-feature-select,.atlas-citation-actions button')].filter(n=>n.getClientRects().length).map(n=>({text:n.id||n.textContent,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,height:n.getBoundingClientRect().height}))}));
 assert.equal(geometry.scrollWidth<=width,true,`${item.name} overflow at ${width}`);assert.deepEqual(errors,[]);assert.ok(geometry.controls.every(n=>n.left>=-1&&n.right<=width+1&&n.height>=43),`${item.name} clipped or undersized controls`);
 const filename=`${width}-${item.name}.png`;await page.screenshot({path:path.join(output,filename)});
 result.push({width,case:item.name,filename,featureState:await page.locator('#atlas-feature-viewer').getAttribute('data-state'),geometry,errors});console.log(filename);await page.close();
}}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}await fs.writeFile(path.join(output,'review.json'),JSON.stringify({base,created:new Date().toISOString(),captures:result},null,2)+'\n');})();
