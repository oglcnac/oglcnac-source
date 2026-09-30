const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const Papa = require('papaparse');
const { AxeBuilder } = require('@axe-core/playwright');
const ROOT = path.resolve(__dirname, '../..');
const STATIC_ROOT = process.env.SITE_STATIC_ROOT || path.join(ROOT, 'dist');
const browserName = process.env.SITE_BROWSER || 'chromium';
const MIME = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
let server, browser, baseUrl, source;
test.before(async () => {
  source = JSON.parse(await fs.readFile(path.join(ROOT,'public/static/data/atlas-records.json'),'utf8')).filter(row=>row.accession==='P12270');
  server = http.createServer(async (request,response) => {
    let filename = path.join(STATIC_ROOT,decodeURIComponent(new URL(request.url,'http://localhost').pathname));
    if(!path.extname(filename))filename=path.join(filename,'index.html');
    try{const body=await fs.readFile(filename);response.writeHead(200,{'Content-Type':MIME[path.extname(filename)]||'application/octet-stream'});response.end(body);}catch(_){response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseUrl=process.env.SITE_BASE_URL||`http://127.0.0.1:${server.address().port}`;
  browser=await playwright[browserName].launch();
});
test.after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function ready(page, accession='P12270', site='') {
  await page.goto(`${baseUrl}/atlas/detail/?id=${accession}${site?`&site=${site}`:''}`);
  await page.waitForSelector('#atlas-protein-viewer[data-state="ready"], #atlas-protein-viewer[data-state="unavailable"]');
}
async function rowCounts(page) { return page.evaluate(()=>['detail1','detail2','detail3'].map(id=>window.OglcnacTables.get(id).totalRows)); }
async function downloaded(page, selector) { const waiting=page.waitForEvent('download');await page.locator(selector).click();const file=await waiting;return {name:file.suggestedFilename(),text:await fs.readFile(await file.path(),'utf8')}; }

async function enriched(page,id='P12270',site='') { await ready(page,id,site);await page.waitForSelector('#atlas-feature-viewer[data-state]');await page.waitForFunction(()=>!document.getElementById('atlas-publication-status').textContent.includes('Loading')); }
async function checkRows(page,count,total=75){assert.deepEqual(await rowCounts(page),[count,count,total]);assert.match(await page.locator('[data-evidence="summary"]').innerText(),new RegExp(`^${count} of ${total} source records`));assert.match(await page.locator('[data-pv="counts"]').innerText(),new RegExp(`^${count} records?`));}

test('linked facets, position, history and all-field matching exports agree with real source records',async()=>{
 const page=await browser.newPage();await enriched(page,'P12270','1676');
 const method=source.find(r=>Number(r.position_in_protein)===1676).method.trim().toLowerCase();
 await page.selectOption('#atlas-filter-method',method);await page.selectOption('#atlas-filter-ambiguity','unambiguous');
 const expected=source.filter(r=>Number(r.position_in_protein)===1676&&r.method.trim().toLowerCase()===method&&r.ambiguous.trim().toLowerCase()==='unambiguous');assert.ok(expected.length>0);await checkRows(page,expected.length);
 const fields=Object.keys(source[0]);const csv=await downloaded(page,'[data-evidence="download"]');const parsed=Papa.parse(csv.text,{header:true,skipEmptyLines:true});assert.deepEqual(new Set(parsed.meta.fields),new Set(fields));assert.deepEqual(parsed.data.map(r=>r.id).sort(),expected.map(r=>String(r.id)).sort());
 await page.locator('[data-pv="clear"]').click();const allPositions=source.filter(r=>r.method.trim().toLowerCase()===method&&r.ambiguous.trim().toLowerCase()==='unambiguous');await checkRows(page,allPositions.length);assert.equal(new URL(page.url()).searchParams.get('method'),method);
 await page.goBack();await checkRows(page,expected.length);await page.reload();await page.waitForSelector('#atlas-feature-viewer[data-state]');await checkRows(page,expected.length);
 await page.locator('[data-evidence="reset"]').click();await checkRows(page,75);assert.equal(new URL(page.url()).searchParams.has('site'),false);assert.equal(new URL(page.url()).searchParams.has('method'),false);await page.close();
});

test('sample filters, zero results and unknown URL values have honest counts and retain complete evidence',async()=>{
 const page=await browser.newPage();await enriched(page);const sample=source[0].sample_type.trim().toLowerCase();await page.selectOption('#atlas-filter-sample',sample);await checkRows(page,source.filter(r=>r.sample_type.trim().toLowerCase()===sample).length);
 await page.goto(`${baseUrl}/atlas/detail/?id=P12270&site=1676&method=does-not-exist`);await page.waitForSelector('#atlas-feature-viewer[data-state]');await checkRows(page,0);assert.match(await page.locator('[data-evidence="summary"]').innerText(),/No records match/);assert.equal(await page.locator('[data-evidence="download"]').isDisabled(),true);assert.equal(await page.locator('#atlas-publication-list>li').count(),0);
 const full=await downloaded(page,'#atlas-download-record');assert.equal(Papa.parse(full.text,{header:true,skipEmptyLines:true}).data.length,75);await page.locator('[data-evidence="reset"]').click();await checkRows(page,75);await page.close();
});

test('verified citations copy full metadata and publication actions restore focused evidence and history',async()=>{
 const page=await browser.newPage();await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedText=value;}}});});await enriched(page);
 const item=page.locator('.atlas-citation').first(),pmid=await item.getAttribute('data-pmid');const title=await item.locator('h3').innerText();assert.ok(title.length>20&&!title.startsWith('PMID'));
 await item.getByRole('button',{name:'Copy citation',exact:false}).click();const copied=await page.evaluate(()=>window.copiedText);assert.ok(copied.includes(title.replace(/\.$/,'')));assert.ok(copied.includes('PMID: '+pmid));
 await item.getByRole('button',{name:/View .*evidence records/}).click();assert.equal(new URL(page.url()).searchParams.get('pmid'),pmid);assert.equal(await page.locator('#atlas-filter-pmid').inputValue(),pmid);assert.equal(await page.evaluate(()=>document.activeElement.id),'atlas-evidence-heading');await checkRows(page,source.filter(r=>String(r.pmid).match(/\b\d{6,9}\b/g)?.includes(pmid)).length);await page.goBack();await checkRows(page,75);await page.close();
});

test('verified features support keyboard selection, exact coordinates and mismatch audit without claiming overlap',async()=>{
 const page=await browser.newPage();await enriched(page,'O15294');assert.equal(await page.locator('#atlas-feature-viewer').getAttribute('data-state'),'verified');assert.ok(await page.locator('.feature-bar').count()>0);
 await page.locator('#atlas-feature-select').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'atlas-feature-select');assert.match(await page.locator('[data-feature="detail"]').innerText(),/residues \d/);await page.locator('.feature-inventory summary').click();assert.equal(await page.locator('[data-feature="inventory"] li').count(),14);
 await enriched(page,'P49792','868');assert.match(await page.locator('[data-feature="overlap"]').innerText(),/No site-to-region association/);assert.match(await page.locator('[data-feature="audit"]').innerText(),/Original source values are retained/);assert.equal(await page.locator('.feature-selection-line').count(),0);await page.close();
});

test('publication metadata failure retains PMID links and independent sequence context',async()=>{
 const page=await browser.newPage();await page.route('**/atlas-enrichment/publications.json*',route=>route.abort());await enriched(page);assert.match(await page.locator('#atlas-publication-status').innerText(),/unavailable/);assert.equal(await page.locator('#atlas-publication-list>li').count(),21);assert.match(await page.locator('.atlas-citation h3').first().innerText(),/^PMID/);assert.equal(await page.locator('#atlas-feature-viewer').getAttribute('data-state'),'verified');await checkRows(page,75);await page.close();
});

test('changed sequence metadata is never plotted, and missing sequences keep every source row',async()=>{
 const page=await browser.newPage();await page.route('**/atlas-enrichment/proteins/*.json*',async route=>{const response=await route.fetch();const payload=await response.json();payload.proteins.P12270.source_sha256='wrong';await route.fulfill({response,json:payload});});await enriched(page);assert.equal(await page.locator('#atlas-feature-viewer').getAttribute('data-state'),'sequence_mismatch');assert.equal(await page.locator('.feature-bar').count(),0);await checkRows(page,75);await page.unrouteAll();await enriched(page,'Q6UN15-1');assert.equal(await page.locator('.feature-bar').count(),0);assert.equal((await rowCounts(page))[2],5);await page.close();
});

for(const width of [1440,390])test(`filtered citations and annotations pass WCAG A/AA at ${width}px`,async()=>{
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();await enriched(page,'O15294');await page.selectOption('#atlas-feature-select','0');await page.locator('.feature-inventory summary').click();await page.selectOption('#atlas-filter-ambiguity','unambiguous');const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await context.close();
});
