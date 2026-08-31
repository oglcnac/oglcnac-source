const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const playwright = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = path.join(ROOT, "dist");
const routes = require(path.join(ROOT, "site/site.json")).pages.map((page) => page.output === "404.html" ? "/404.html" : page.route);
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
let server; let browser; let baseUrl;
const browserName = process.env.ACCESSIBILITY_BROWSER || "chromium";
const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 },
];

async function wcagViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }));
}

async function waitForRouteReady(page, route) {
  await page.waitForLoadState("networkidle");
  if (route === "/atlas/statistics/") {
    await page.waitForSelector('[data-atlas-release-state="ready"]');
  }
  if (route === "/ogt-pin/statistics/") {
    await page.waitForFunction(() => document.querySelector("#ogt-summary-metrics")?.textContent.includes("3,757"));
  }
}

async function serve(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.join(STATIC_ROOT, requestPath);
  if (!path.extname(file)) file = path.join(file, "index.html");
  try { const body = await fs.readFile(file); response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); response.end(body); }
  catch { response.writeHead(404).end(); }
}

test.before(async () => {
  server = http.createServer(serve); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  if (!playwright[browserName]) throw new Error(`Unsupported ACCESSIBILITY_BROWSER: ${browserName}`);
  baseUrl = `http://127.0.0.1:${server.address().port}`; browser = await playwright[browserName].launch({ headless: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

for (const viewport of viewports) {
  for (const route of routes) {
    test(`${route} has no WCAG 2.2 A/AA violations at ${viewport.name} width`, async () => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(baseUrl + route, { waitUntil: "domcontentloaded" });
      await waitForRouteReady(page, route);
      assert.deepEqual(await wcagViolations(page), []);
      await context.close();
    });
  }
}

for (const viewport of viewports) {
  test(`Workbench result and error states have no WCAG 2.2 A/AA violations at ${viewport.name} width`, { timeout: 180000 }, async () => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(baseUrl + "/analysis/", { waitUntil: "domcontentloaded" });
    await waitForRouteReady(page, "/analysis/");
    await page.click("#workbench-sample");
    await page.click('#workbench-form button[type="submit"]');
    await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
    assert.deepEqual(await wcagViolations(page), []);
    await page.fill("#workbench-fasta", ">invalid\nABCZ");
    await page.click('#workbench-form button[type="submit"]');
    await page.waitForSelector("#workbench-error:not([hidden])");
    assert.deepEqual(await wcagViolations(page), []);
    await context.close();
  });
}
