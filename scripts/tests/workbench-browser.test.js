const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = process.env.SITE_STATIC_ROOT || path.join(ROOT, "dist");
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
    if (/api\.oglcnac\.org|shinyapps\.io|cloudflareinsights|cdn-cgi\/rum|google-analytics|googletagmanager|\/atlas-records\.json|\/atlas-sequences-v1\.json/i.test(request.url())) forbidden.push(request.url());
  });
  await page.goto(`${baseUrl}/analysis/`, { waitUntil: "domcontentloaded" });
  await page.click("#workbench-sample");
  assert.match(await page.inputValue("#workbench-fasta"), /sp\|Q96EH5\|RL39L_HUMAN/);
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
  const headings = await page.locator("#workbench-table th").allTextContents();
  assert.deepEqual(headings, ["Protein", "Species", "Length", "Sequence check", "Site", "Window", "Prediction score", "Confidence", "Model", "Atlas", "Atlas records", "PMIDs", "OGT-PIN", "Evidence"]);
  assert.match((await page.locator("#workbench-table tbody tr").first().textContent()), /O-GlcNAcPRED-DL 1\.0\.0/);
  assert.match((await page.locator("#workbench-table tbody tr").first().textContent()), /verified against tracked sequence/);
  assert.equal(await page.locator("#workbench-site-map .site-track").count(), 1);
  const threonine6 = page.locator("#workbench-table tbody tr").filter({ has: page.locator("td:nth-child(5)", { hasText: /^T6$/ }) });
  assert.equal(await threonine6.locator("td").nth(9).textContent(), "unambiguous");
  assert.equal(await threonine6.locator("td").nth(10).textContent(), "1");
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
  assert.match(await page.locator("#workbench-filter-status").textContent(), /0 of \d+ rows shown\. Full CSV\/JSON downloads include all rows\./);
  const downloadPromise = page.waitForEvent("download");
  await page.click("#workbench-json");
  const download = await downloadPromise;
  const content = await fs.readFile(await download.path(), "utf8");
  const rows = JSON.parse(content);
  assert.ok(rows.length > 0);
  assert.deepEqual(Object.keys(rows[0]), ["protein_id", "species", "sequence_length", "sequence_verification", "position", "residue", "sequence_window", "prediction_score", "confidence_band", "model_version", "atlas_status", "atlas_record_count", "atlas_pmids", "ogt_pin_status", "ogt_pin_evidence_count"]);
  assert.equal(await page.locator("#workbench-filtered-csv").isDisabled(), true);
  await page.click("#workbench-reset-filter");
  await page.selectOption("#workbench-evidence-filter", "atlas");
  const expected = rows.filter(row => row.atlas_record_count > 0);
  assert.ok(expected.length > 0 && expected.length < rows.length);
  const filteredDownload = page.waitForEvent("download");
  await page.click("#workbench-filtered-csv");
  const filtered = require("papaparse").parse(await fs.readFile(await (await filteredDownload).path(), "utf8"), { header: true, skipEmptyLines: true });
  assert.deepEqual(filtered.data.map(row => Number(row.position)), expected.map(row => row.position));
  assert.ok(filtered.data.every(row => Number(row.atlas_record_count) > 0));
  await page.click("#workbench-reset-filter");
  assert.equal(await page.inputValue("#workbench-evidence-filter"), "");
  assert.match(await page.locator("#workbench-filter-status").textContent(), new RegExp(`${rows.length} of ${rows.length} rows shown`));
  await page.close();
});

test("cancellation cannot be reversed by an in-flight evidence load", { timeout: 180000 }, async () => {
  const page = await browser.newPage();
  let releaseEvidence;
  const evidenceGate = new Promise((resolve) => { releaseEvidence = resolve; });
  await page.route("**/static/data/atlas-v2/records/*.json*", async (route) => {
    await evidenceGate;
    await route.continue();
  });
  await page.goto(`${baseUrl}/analysis/`, { waitUntil: "domcontentloaded" });
  await page.click("#workbench-sample");
  const evidenceRequest = page.waitForRequest("**/static/data/atlas-v2/records/*.json*");
  await page.click('#workbench-form button[type="submit"]');
  await evidenceRequest;
  try { await page.click("#workbench-cancel"); }
  finally { releaseEvidence(); }
  await page.evaluate(() => window.OglcnacStaticData.loadAtlasRecordsForAccessions(["Q96EH5"]));
  assert.equal(await page.locator("#workbench-results").isHidden(), true);
  assert.match(await page.locator("#workbench-error").textContent(), /cancelled/i);
  await page.close();
});

test("accepts a UniProt isoform accession without collapsing it to the canonical accession", { timeout: 180000 }, async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/analysis/`, { waitUntil: "domcontentloaded" });
  await page.click("#workbench-sample");
  const sample = await page.inputValue("#workbench-fasta");
  await page.fill("#workbench-fasta", sample.replace("Q96EH5", "Q96EH5-2"));
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
  assert.match(await page.locator("#workbench-table tbody tr").first().textContent(), /Q96EH5-2/);
  assert.doesNotMatch(await page.locator("#workbench-table tbody tr").first().textContent(), /verified against tracked sequence/);
  await page.close();
});

async function installControllableWorker(page) {
  await page.addInitScript(() => {
    window.testWorkers = [];
    window.Worker = class extends EventTarget {
      constructor() { super(); window.testWorkers.push(this); }
      postMessage(message) { this.job = message; }
      terminate() { this.terminated = true; }
      fail() { this.dispatchEvent(new ErrorEvent("error", { message: "Delayed startup failure", cancelable: true })); }
      complete(count = 1) {
        const results = Array.from({ length: count }, (_, index) => ({ id: "RETRY", position: index + 1, residue: "S", window: "SSS", score: "0.796", confidence: "+" }));
        this.dispatchEvent(new MessageEvent("message", { data: { type: "result", jobId: this.job.jobId, results } }));
      }
    };
  });
}

test("stale worker errors cannot replace cancellation or a new job and engine failure is retryable", async () => {
  const page = await browser.newPage();
  await installControllableWorker(page);
  await page.goto(`${baseUrl}/analysis/`);
  await page.fill("#workbench-fasta", ">RETRY\nSSS");
  await page.click('#workbench-form button[type="submit"]');
  await page.click("#workbench-cancel");
  await page.evaluate(() => { window.testWorkers[0].fail(); window.testWorkers[0].complete(); });
  assert.equal(await page.locator("#workbench-error").textContent(), "Analysis cancelled.");
  assert.equal(await page.locator("#workbench-results").isHidden(), true);
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForFunction(() => window.testWorkers.length === 2);
  await page.evaluate(() => window.testWorkers[0].fail());
  assert.equal(await page.locator("#workbench-error").isHidden(), true);
  assert.equal(await page.locator("#workbench-cancel").isEnabled(), true);
  await page.evaluate(() => window.testWorkers[1].fail());
  assert.match(await page.locator("#workbench-error").textContent(), /Try submitting again/);
  await page.click('#workbench-form button[type="submit"]');
  await page.evaluate(() => window.testWorkers[2].complete());
  await page.waitForSelector("#workbench-table tbody tr");
  assert.equal(await page.locator("#workbench-error").isHidden(), true);
  assert.equal(await page.evaluate(() => window.testWorkers.length), 3);
  await page.close();
});

test("mobile cards expose site, score, confidence and evidence while exports retain all paged and filtered rows", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await installControllableWorker(page);
  await page.goto(`${baseUrl}/analysis/`);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const input = await page.locator("#workbench-fasta").boundingBox();
    const run = await page.locator('#workbench-form button[type="submit"]').boundingBox();
    assert.ok(input.y <= 480, `${width}px FASTA input starts at ${input.y}`);
    assert.ok(run.y <= 800, `${width}px Run starts at ${run.y}`);
  }
  await page.fill("#workbench-fasta", `>RETRY\n${"S".repeat(30)}`);
  await page.click('#workbench-form button[type="submit"]');
  await page.evaluate(() => window.testWorkers[0].complete(30));
  await page.waitForSelector(".workbench-site-card");
  assert.equal(await page.locator(".workbench-site-card").count(), 25);
  assert.equal(await page.locator(".workbench-desktop-table").isHidden(), true);
  const card = page.locator(".workbench-site-card").first();
  assert.match(await card.innerText(), /S1/);
  assert.match(await card.innerText(), /0\.796/);
  assert.match(await card.innerText(), /Confidence\s+\+/);
  assert.match(await card.innerText(), /Atlas\s+identifier unavailable/);
  await card.locator("summary").click();
  assert.match(await card.innerText(), /O-GlcNAcPRED-DL 1\.0\.0/);
  await page.click("#workbench-next");
  assert.equal(await page.locator(".workbench-site-card").count(), 5);
  assert.match(await page.locator(".workbench-site-card").first().innerText(), /S26/);
  await page.fill("#workbench-filter", "no-matching-row");
  const promise = page.waitForEvent("download");
  await page.click("#workbench-json");
  const download = await promise;
  const rows = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  assert.equal(rows.length, 30);
  assert.equal(rows[29].position, 30);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.close();
});

test("uploaded FASTA can be reviewed without losing the selected species and runs the mouse model", { timeout: 120000 }, async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/analysis/`);
  await page.selectOption("#workbench-species", "mouse");
  await page.click("#workbench-upload-mode");
  await page.setInputFiles("#workbench-file", { name: "mouse.fasta", mimeType: "text/plain", buffer: Buffer.from(">custom_mouse\nMSSST") });
  await page.waitForFunction(() => document.querySelector("#workbench-fasta").value.includes("custom_mouse"));
  await page.click("#workbench-paste-mode");
  assert.equal(await page.inputValue("#workbench-species"), "mouse");
  assert.equal(await page.inputValue("#workbench-fasta"), ">custom_mouse\nMSSST");
  await page.click('#workbench-form button[type="submit"]');
  await page.waitForSelector("#workbench-table tbody tr", { timeout: 120000 });
  assert.equal(await page.locator("#workbench-table tbody tr").count(), 4);
  assert.match(await page.locator("#workbench-table tbody tr").first().textContent(), /custom_mouse.*mouse.*O-GlcNAcPRED-DL 1\.0\.0 \(mouse\)/);
  await page.close();
});

test("compact desktop columns expand to every field without changing exports", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await installControllableWorker(page);
  await page.goto(`${baseUrl}/analysis/`);
  await page.fill("#workbench-fasta", ">RETRY\nSSS");
  await page.click('#workbench-form button[type="submit"]');
  await page.evaluate(() => window.testWorkers[0].complete(3));
  await page.waitForSelector("#workbench-table tbody tr");
  const sequenceCheck = page.locator("#workbench-table thead th").nth(3);
  assert.equal(await sequenceCheck.isHidden(), true);
  const beforeDownload = page.waitForEvent("download");
  await page.click("#workbench-json");
  const before = await beforeDownload;
  const beforeRows = JSON.parse(await fs.readFile(await before.path(), "utf8"));
  await page.click("#workbench-table-fields");
  assert.equal(await sequenceCheck.isVisible(), true);
  assert.equal(await page.locator("#workbench-table-fields").getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#workbench-table th:visible").count(), 14);
  const afterDownload = page.waitForEvent("download");
  await page.click("#workbench-json");
  const after = await afterDownload;
  assert.deepEqual(JSON.parse(await fs.readFile(await after.path(), "utf8")), beforeRows);
  await page.click("#workbench-table-fields");
  assert.equal(await sequenceCheck.isHidden(), true);
  await page.close();
});
