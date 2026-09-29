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
  baseUrl=`http://127.0.0.1:${server.address().port}`;
  browser=await playwright[browserName].launch();
});
test.after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function ready(page, accession='P12270', site='') {
  await page.goto(`${baseUrl}/atlas/detail/?id=${accession}${site?`&site=${site}`:''}`);
  await page.waitForSelector('#atlas-protein-viewer[data-state="ready"], #atlas-protein-viewer[data-state="unavailable"]');
}
async function rowCounts(page) { return page.evaluate(()=>['detail1','detail2','detail3'].map(id=>window.OglcnacTables.get(id).totalRows)); }
async function downloaded(page, selector) { const waiting=page.waitForEvent('download');await page.locator(selector).click();const file=await waiting;return {name:file.suggestedFilename(),text:await fs.readFile(await file.path(),'utf8')}; }

test('protein map selection links real source evidence, sequence, publication counts and browser history',async()=>{
  const page=await browser.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await ready(page);
  assert.deepEqual(await rowCounts(page),[75,75,75]);
  assert.equal(await page.locator('#atlas-position-count').innerText(),'27');
  await page.selectOption('#protein-position','1676');
  assert.equal(new URL(page.url()).searchParams.get('site'),'1676');
  assert.deepEqual(await rowCounts(page),[25,25,75]);
  assert.equal(await page.locator('[data-pv="selected-title"]').innerText(),'S1676');
  assert.equal(await page.locator('[data-pv="unambiguous"]').innerText(),'23');
  assert.equal(await page.locator('[data-pv="ambiguous"]').innerText(),'2');
  assert.equal(await page.locator('#atlas-publication-list > li').count(),17);
  assert.equal(await page.locator('.protein-context-residue[data-selected="true"]').innerText(),'S');
  assert.equal(await page.locator('#protein-sequence [data-selected="true"]').getAttribute('data-sequence-position'),'1676');
  await page.locator('[data-pv="full"]').click();assert.deepEqual(await rowCounts(page),[25,25,75]);
  await page.locator('[data-pv="next"]').click();assert.equal(new URL(page.url()).searchParams.get('site'),'1677');
  assert.deepEqual(await rowCounts(page),[5,5,75]);
  await page.goBack();assert.deepEqual(await rowCounts(page),[25,25,75]);
  await page.goBack();assert.deepEqual(await rowCounts(page),[75,75,75]);
  await page.goForward();assert.deepEqual(await rowCounts(page),[25,25,75]);
  await page.reload();await page.waitForSelector('#atlas-protein-viewer[data-state="ready"]');assert.deepEqual(await rowCounts(page),[25,25,75]);
  const mark=page.locator('[data-pv="tracks"] circle').first();await mark.click({force:true});
  assert.notEqual(await page.locator('#protein-position').inputValue(),'1676');
  await page.locator('[data-pv="clear"]').click();assert.deepEqual(await rowCounts(page),[75,75,75]);
  assert.equal(new URL(page.url()).searchParams.has('site'),false);assert.equal(await page.locator('#atlas-publication-list > li').count(),21);
  assert.deepEqual(errors,[]);await page.close();
});

test('protein position CSV, complete exports, FASTA and copied links preserve actual data',async()=>{
  const context=await browser.newContext({acceptDownloads:true});
  await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=String(text);}}}));
  const page=await context.newPage();await ready(page,'P12270','1676');
  const filtered=await downloaded(page,'[data-table-csv-for="detail2"]');
  assert.equal(filtered.name,'P12270-position-1676-evidence.csv');
  const rows=Papa.parse(filtered.text,{header:true}).data;
  assert.deepEqual(rows.map(row=>Number(row.ID)),source.filter(row=>row.position_in_protein==='1676').map(row=>row.id));
  for(const selector of ['#atlas-download-record','[data-table-csv-for="detail3"]']) {
    const output=Papa.parse((await downloaded(page,selector)).text,{header:true});assert.equal(output.data.length,75);
    for(let i=0;i<source.length;i++)for(const key of Object.keys(source[i]))assert.equal(output.data[i][key],String(source[i][key]??''));
  }
  const fasta=await downloaded(page,'#atlas-download-fasta');assert.equal(fasta.name,'P12270.fasta');
  const sequence=JSON.parse(await fs.readFile(path.join(ROOT,'public/static/data/atlas-sequences-v1.json'),'utf8')).sequences.P12270;
  assert.equal(fasta.text.trim().split('\n').slice(1).join(''),sequence);
  await page.locator('#atlas-copy-fasta').click();assert.equal(await page.evaluate(()=>window.__copied),fasta.text);
  await page.locator('#atlas-copy-accession').click();assert.equal(await page.evaluate(()=>window.__copied),'P12270');
  await page.locator('[data-pv="share"]').click();const link=new URL(await page.evaluate(()=>window.__copied));
  assert.equal(link.searchParams.get('id'),'P12270');assert.equal(link.searchParams.get('site'),'1676');assert.equal(link.hash,'#atlas-landscape');
  await page.goto(link.href);await page.waitForSelector('#atlas-protein-viewer[data-state="ready"]');
  await page.waitForFunction(()=>{const top=document.getElementById('atlas-landscape').getBoundingClientRect().top;return top>=0&&top<200;});
  assert.deepEqual(await rowCounts(page),[25,25,75]);
  await context.close();
});

test('protein map controls support keyboard selection and keep focus while evidence changes',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});await ready(page);
  await page.locator('#protein-position').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('protein-position').value==='111');
  assert.equal(await page.locator('[data-pv="previous"]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'protein-position');
  assert.deepEqual(await rowCounts(page),[1,1,75]);
  await page.locator('[data-pv="next"]').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#protein-position').inputValue(),'650');
  assert.equal(await page.locator('[data-pv="unambiguous"]').innerText(),'0');assert.equal(await page.locator('[data-pv="ambiguous"]').innerText(),'1');
  await page.close();
});

test('pending protein records keep the footer below the viewport while data arrives',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let release;const held=new Promise(resolve=>{release=resolve;});
  await page.route('**/static/data/atlas-v2/records/*.json*',async route=>{await held;await route.continue();});
  try {
    await page.goto(`${baseUrl}/atlas/detail/?id=O15294`);
    assert.equal(await page.locator('[data-record-state="atlas"]').getAttribute('data-state'),'loading');
    assert.ok((await page.locator('.site-footer').boundingBox()).y>=844);
  } finally { release(); }
  await page.waitForSelector('#atlas-protein-viewer[data-state="ready"]');
  assert.deepEqual(await rowCounts(page),[5,5,5]);await page.close();
});

test('protein records without sequences or numeric positions keep all curated evidence usable',async()=>{
  const page=await browser.newPage();await page.route('https://rest.uniprot.org/**',route=>route.abort());
  await ready(page,'P08154');assert.equal(await page.locator('#protein-position').isDisabled(),true);
  assert.match(await page.locator('[data-pv="state"]').innerText(),/No single numeric/);
  assert.deepEqual(await rowCounts(page),[3,3,3]);assert.equal(await page.locator('#atlas-download-fasta').isEnabled(),true);
  await ready(page,'62658155');assert.match(await page.locator('[data-pv="state"]').innerText(),/no available sequence/);
  assert.deepEqual(await rowCounts(page),[4,4,4]);assert.equal(await page.locator('#atlas-download-fasta').isDisabled(),true);
  await ready(page,'Q6UN15-1');assert.deepEqual(await rowCounts(page),[5,5,5]);
  await page.selectOption('#protein-position','253');assert.equal((await rowCounts(page))[0],1);
  assert.match(await page.locator('[data-pv="context"]').innerText(),/unavailable/);
  await ready(page,'P07901');await page.selectOption('#protein-position','461');assert.deepEqual(await rowCounts(page),[2,2,2]);
  assert.equal(await page.locator('[data-pv="next"]').isDisabled(),true);assert.equal(await page.locator('[data-pv="previous"]').isDisabled(),true);
  await ready(page,'P49792','868');assert.equal(await page.locator('[data-pv="selected-title"]').innerText(),'Position 868');
  assert.match(await page.locator('[data-pv="residue-note"]').innerText(),/Source records report/);
  assert.equal(await page.locator('[data-pv="mapping-note"]').isVisible(),true);
  await ready(page,'Q8VID1','338');assert.match(await page.locator('[data-pv="context"]').innerText(),/outside/);
  assert.ok((await rowCounts(page))[0]>0);
  await page.goto(`${baseUrl}/atlas/detail/?id=NOT-A-RECORD`);await page.waitForSelector('[data-record-state="atlas"][data-state="empty"]');
  assert.equal(await page.locator('#atlas-landscape').isVisible(),false);
  await page.close();
});

test('mixed, out-of-range and unsupported positions never become invented sequence annotations',async()=>{
  const page=await browser.newPage();
  await page.route('**/static/data/atlas-v2/records/*.json*',async route=>{
    const response=await route.fetch(),bucket=await response.json();
    if(bucket.records.P12270){const example=bucket.records.P12270[0][1];for(const [index,value] of ['12/13','T886','99999','4.5'].entries())bucket.records.P12270.push([900000+index,{...example,id:900000+index,position_in_protein:value}]);}
    await route.fulfill({response,json:bucket});
  });
  await ready(page,'P12270','99999');assert.deepEqual(await rowCounts(page),[1,1,79]);
  assert.match(await page.locator('[data-pv="context"]').innerText(),/outside/);
  assert.match(await page.locator('[data-pv="unmapped"]').innerText(),/3 records have no single numeric position/);
  assert.equal(await page.locator('[data-pv="region"]').isDisabled(),true);
  await page.locator('[data-pv="clear"]').click();assert.deepEqual(await rowCounts(page),[79,79,79]);
  assert.equal(await page.locator('#protein-position option[value="886"]').count(),0);
  assert.equal(await page.locator('#protein-position option[value="4"]').count(),0);
  await ready(page,'P12270','886');assert.deepEqual(await rowCounts(page),[79,79,79]);
  assert.equal(await page.locator('#protein-position').inputValue(),'');await page.close();
});

test('protein maps, long names and sequence context fit five supported viewport widths',async()=>{
  const page=await browser.newPage();
  for(const width of [320,390,768,1440,1920]) {
    await page.setViewportSize({width,height:1000});
    for(const [accession,site] of [['P12270','1676'],['O15294','3']]) {
      await ready(page,accession,site);
      const result=await page.evaluate(()=>({page:document.documentElement.scrollWidth<=innerWidth,
        context:document.querySelector('[data-pv="context"]').scrollWidth<=document.querySelector('[data-pv="context"]').clientWidth,
        controls:[...document.querySelectorAll('.protein-viewer-toolbar button,.protein-viewer-toolbar select')].map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})),
        labels:[...document.querySelector('[data-pv="tracks"]').querySelectorAll('text')].map(el=>{const a=el.getBoundingClientRect(),b=el.ownerSVGElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})}));
      assert.ok(result.page,`${accession} page overflow at ${width}`);assert.ok(result.context,`${accession} sequence overflow at ${width}`);
      assert.ok(result.controls.every(control=>control.left>=0&&control.right<=width),`${accession} clipped controls at ${width}`);
      assert.ok(result.labels.every(Boolean),`${accession} clipped axis labels at ${width}`);
    }
  }
  await page.close();
});

for(const width of [1440,390])test(`selected protein map has no WCAG A/AA violations at ${width}px`,{timeout:120000},async()=>{
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();await ready(page,'P12270','1676');
  await page.locator('.sequence-disclosure summary').click();
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(node=>node.target)})),[]);await context.close();
});
