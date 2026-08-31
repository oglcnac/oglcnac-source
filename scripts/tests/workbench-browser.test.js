const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = path.join(ROOT, "dist");
const MIME = { ".bin": "application/octet-stream", ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
let server; let browser; let baseUrl;
const browserName = process.env.WORKBENCH_BROWSER || "chromium";

async function serve(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.join(STATIC_ROOT, requestPath);
  if (!path.extname(file)) file = path.join(file, "index.html");
  if (!file.startsWith(STATIC_ROOT)) return response.writeHead(403).end();
  try { const body = await fs.readFile(file); response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); response.end(body); }
  catch { response.writeHead(404).end(); }
}

test.before(async () => {
  server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  if (!playwright[browserName]) throw new Error(`Unsupported WORKBENCH_BROWSER: ${browserName}`);
  browser = await playwright[browserName].launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("runs the sample locally and exposes prediction and evidence fields", { timeout: 180000 }, async () => {
  const page = await browser.newPage();
  const forbidden = [];
  page.on("request", (request) => {
    if (/api\.oglcnac\.org|shinyapps\.io|cloudflareinsights|cdn-cgi\/rum|google-analytics|googletagmanager/i.test(request.url())) forbidden.push(request.url());
  });
  await page.goto(`${baseUrl}/analysis/`, { waitUntil: "domcontentloaded" });
  await page.click("#workbench-sample");
  assert.match(await page.inputValue("#workbench-fasta"), /sp\|P18583\|SON_HUMAN/);
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
  const headings = await page.locator("#workbench-table th").allTextContents();
  assert.deepEqual(headings, ["Protein", "Species", "Length", "Site", "Window", "Probability", "Confidence", "Model", "Atlas", "Atlas records", "PMIDs", "OGT-PIN", "Evidence"]);
  assert.match((await page.locator("#workbench-table tbody tr").first().textContent()), /O-GlcNAcPRED-DL 1\.0\.0/);
  assert.equal(await page.locator("#workbench-site-map .site-track").count(), 1);
  assert.deepEqual(forbidden, []);
  await page.close();
});

test("filters displayed rows and exports the full versioned JSON schema", { timeout: 180000 }, async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/analysis/`, { waitUntil: "domcontentloaded" });
  await page.click("#workbench-sample");
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
  await page.fill("#workbench-filter", "identifier unavailable");
  assert.equal(await page.locator("#workbench-table tbody tr").count(), 0);
  const downloadPromise = page.waitForEvent("download");
  await page.click("#workbench-json");
  const download = await downloadPromise;
  const content = await fs.readFile(await download.path(), "utf8");
  const rows = JSON.parse(content);
  assert.ok(rows.length > 0);
  assert.deepEqual(Object.keys(rows[0]), ["protein_id", "species", "sequence_length", "position", "residue", "sequence_window", "probability", "confidence_band", "model_version", "atlas_status", "atlas_record_count", "atlas_pmids", "ogt_pin_status", "ogt_pin_evidence_count"]);
  await page.close();
});
