const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const playwright = require('playwright');
const { createPageNavigator, classifyRequestFailure, classifyHttpResponse } = require('../browser-smoke-core.js');

let server, browser, base;
test.before(async () => {
  server = http.createServer((request, response) => {
    if (request.url === '/slow-data') return; // Pending until the page closes/aborts.
    if (request.url === '/manifest') return response.end('{}');
    if (request.url === '/broken-data') return response.writeHead(503).end('unavailable');
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Smoke fixture</title><h1>Ready</h1>
      <script>window.controller = new AbortController();</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright[process.env.SMOKE_BROWSER || 'chromium'].launch();
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function session(t) {
  const context = await browser.newContext();
  const failures = [], responses = [], aborts = [];
  const navigator = createPageNavigator(context, (page, lifecycle) => {
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText || 'unknown request failure';
      const outcome = classifyRequestFailure({ errorText, pageRetired: lifecycle.retired });
      aborts.push({ url: request.url(), outcome });
      if (outcome === 'fatal') failures.push(request.url());
    });
    page.on('response', response => {
      if (classifyHttpResponse(response.status()) === 'fatal') responses.push(response.status());
    });
  });
  t.after(async () => { await navigator.close(); await context.close(); });
  return { navigator, failures, responses, aborts };
}

test('moving on from chained in-flight data requests does not fail the smoke run', async t => {
  const { navigator, failures, aborts } = await session(t);
  const first = await navigator.goto(base, { waitUntil: 'domcontentloaded' });
  const requested = first.page.waitForRequest('**/slow-data');
  await first.page.evaluate(() => {
    fetch('/manifest').then(() => fetch('/slow-data')).catch(() => {});
  });
  await requested;
  const second = await navigator.goto(base + '/next', { waitUntil: 'domcontentloaded' });
  assert.equal(await second.page.locator('h1').textContent(), 'Ready');
  assert.notEqual(first.page, second.page);
  assert.equal(first.page.isClosed(), true);
  assert.deepEqual(failures, []);
  assert.ok(aborts.every(item => item.outcome === 'ignore'));
});

test('an aborted data request on the current page still fails', async t => {
  const { navigator, failures } = await session(t);
  const { page } = await navigator.goto(base);
  const requested = page.waitForRequest('**/slow-data');
  await page.evaluate(() => {
    fetch('/slow-data', { signal: controller.signal }).catch(() => {});
  });
  await requested;
  const failed = page.waitForEvent('requestfailed');
  await page.evaluate(() => controller.abort());
  await failed;
  assert.deepEqual(failures, [base + '/slow-data']);
});

test('a real HTTP failure remains recorded after moving to the next page', async t => {
  const { navigator, responses } = await session(t);
  const { page } = await navigator.goto(base);
  await page.evaluate(() => fetch('/broken-data'));
  await navigator.goto(base + '/next');
  assert.deepEqual(responses, [503]);
});
