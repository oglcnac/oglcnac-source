const { chromium } = require('playwright');

const baseUrl = process.env.OGLCNAC_BASE_URL || 'https://oglcnac.org';
const pages = [
  '/',
  '/atlas/',
  '/atlas/statistics/',
  '/atlas/search/',
  '/atlas/browse/',
  '/atlas/tutorial/',
  '/atlas/download/',
  '/atlas/contact/',
  '/ogt-pin/',
  '/ogt-pin/statistics/',
  '/ogt-pin/search/',
  '/ogt-pin/tutorial/',
  '/ogt-pin/contact/',
  '/pred_dl/',
  '/pred_dl/input_fasta/',
  '/pred_dl/tutorial/',
  '/pred_dl/download/',
  '/pred_dl/contact/',
];

function isIgnoredRequest(url) {
  return url.includes('/cdn-cgi/rum') || url.includes('favicon');
}

(async () => {
  const errors = [];
  const failedRequests = [];
  const apiDataRequests = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (!isIgnoredRequest(request.url())) {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    }
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/data/')) {
      apiDataRequests.push(request.url());
    }
  });

  for (const path of pages) {
    const response = await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = response && response.status();
    const title = await page.title();
    const h1 = await page.locator('h1').first().textContent().catch(() => '');
    if (status !== 200) throw new Error(`${path} returned HTTP ${status}`);
    console.log(`PAGE ${status} ${path} | ${title} | ${String(h1).trim()}`);
  }

  await page.goto(baseUrl + '/atlas/search/?q=P18583&field=accession', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.querySelectorAll('#atlas-search-results tr').length > 0, null, {
    timeout: 45000,
  });
  console.log(`ATLAS_SEARCH_ROWS ${await page.locator('#atlas-search-results tr').count()}`);

  await page.goto(baseUrl + '/atlas/browse/?species=Human', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.querySelectorAll('#atlas-browse-results tr').length > 0, null, {
    timeout: 45000,
  });
  console.log(`ATLAS_BROWSE_ROWS ${await page.locator('#atlas-browse-results tr').count()}`);

  await page.goto(baseUrl + '/ogt-pin/search/?q=Q9H1M0&field=uuid_b', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.querySelectorAll('#interactome-search-results tr').length > 0, null, {
    timeout: 45000,
  });
  console.log(`OGT_SEARCH_ROWS ${await page.locator('#interactome-search-results tr').count()}`);

  await page.goto(baseUrl + '/atlas/detail/?id=P18583', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#atlas-peptide-rows tr').length > 0, null, {
    timeout: 45000,
  });
  console.log(`ATLAS_DETAIL_PEPTIDE_ROWS ${await page.locator('#atlas-peptide-rows tr').count()}`);
  console.log(`ATLAS_DETAIL_SEQUENCE_CHARS ${await page.locator('#protein-sequence').textContent().then((text) => text.trim().length)}`);

  await page.goto(baseUrl + '/ogt-pin/detail/?id=Q9H1M0', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#interactome-detail-rows tr').length > 0, null, {
    timeout: 45000,
  });
  console.log(`OGT_DETAIL_ROWS ${await page.locator('#interactome-detail-rows tr').count()}`);

  await page.goto(baseUrl + '/pred_dl/input_fasta/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('#message', '>SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA');
  await page.click('#prediction-text-form button[type="submit"]');
  await page.waitForFunction(
    () => document.querySelectorAll('#prediction-results-body tr').length > 0 ||
      getComputedStyle(document.querySelector('#prediction-error')).display !== 'none',
    null,
    { timeout: 60000 },
  );
  const predictionRows = await page.locator('#prediction-results-body tr').count();
  const predictionError = await page.locator('#prediction-error').textContent().catch(() => '');
  console.log(`PREDICTION_ROWS ${predictionRows}`);
  if (!predictionRows) throw new Error(`prediction returned no rendered rows: ${predictionError}`);

  if (apiDataRequests.length) {
    throw new Error(`Atlas/OGT-PIN made /api/data requests: ${apiDataRequests.join(', ')}`);
  }

  await browser.close();

  if (errors.length || failedRequests.length) {
    console.log('BROWSER_ERRORS');
    for (const item of errors) console.log(item);
    for (const item of failedRequests) console.log(item);
    process.exit(1);
  }
  console.log('BROWSER_SUMMARY PASS');
})().catch(async (error) => {
  console.error('BROWSER_SUMMARY FAIL');
  console.error(error.stack || error.message);
  process.exit(1);
});
