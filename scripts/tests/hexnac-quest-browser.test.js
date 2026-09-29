const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = process.env.HEXNAC_STATIC_ROOT || path.join(ROOT, "dist");
const browserName = process.env.HEXNAC_BROWSER || "chromium";
const browserType = playwright[browserName];
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let server;
let browser;
let baseUrl;

if (!browserType) throw new Error(`Unsupported HEXNAC_BROWSER: ${browserName}`);

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  let filePath = path.join(STATIC_ROOT, requestPath);
  if (!path.extname(filePath)) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(STATIC_ROOT)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}

test.before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await browserType.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("uploads, previews, predicts, charts, summarizes, and downloads locally", async () => {
  const page = await browser.newPage();
  const forbiddenRequests = [];
  page.on("request", (request) => {
    if (/shinyapps\.io|api\.oglcnac\.org/i.test(request.url())) {
      forbiddenRequests.push(request.url());
    }
  });
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`, {
    waitUntil: "domcontentloaded",
  });
  await page.setInputFiles("#hexnac-file", {
    name: "quoted.input.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "id,f126,f138,f144,f168,f186",
        '"001, alpha",0,100,0,0,0',
        "beta,0,0,100,0,0",
        "bad,,2,3,4,5",
      ].join("\n"),
    ),
  });

  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "ready",
  );
  assert.equal(await page.locator("#hexnac-preview-body tr").count(), 2);
  assert.equal(await page.locator("#hexnac-skipped-body tr").count(), 1);
  assert.equal(await page.locator("#hexnac-spectrum rect").count(), 5);

  await page.click("#hexnac-run");
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "complete",
  );

  assert.deepEqual(
    await page.locator("[data-summary]").evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [
          element.dataset.summary,
          element.textContent.trim(),
        ]),
      ),
    ),
    { total: "2", skipped: "1", glcnac: "1", galnac: "1" },
  );
  assert.equal(await page.locator("#hexnac-results-body tr").count(), 2);
  assert.deepEqual(
    await page.locator("#hexnac-results-body tr").first().locator("td").allTextContents(),
    ["GlcNAc", "001, alpha", "0", "100", "0", "0", "0"],
  );

  const downloadPromise = page.waitForEvent("download");
  await page.click("#hexnac-download");
  const download = await downloadPromise;
  assert.equal(
    download.suggestedFilename(),
    "quoted.input_Predicted_results.csv",
  );
  const downloaded = await fs.readFile(await download.path(), "utf8");
  assert.match(downloaded, /^pred_outcome,id,f126,f138,f144,f168,f186\r?\n/);
  assert.match(downloaded, /GlcNAc,"001, alpha",0,100,0,0,0/);
  assert.deepEqual(forbiddenRequests, []);
  await page.close();
});

test("predicts the canonical corpus with the legacy class totals", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`, {
    waitUntil: "domcontentloaded",
  });
  await page.setInputFiles(
    "#hexnac-file",
    path.join(STATIC_ROOT, "static/hexnac-quest/example_input_data.csv"),
  );
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "ready",
  );
  await page.click("#hexnac-preview-pager button:last-child");
  assert.equal(
    await page.locator("#hexnac-preview-body tr").first().locator("td").first().textContent(),
    "21",
  );
  assert.equal(await page.locator("#hexnac-selected-row strong").textContent(), "21");
  const previewHeading = await page.locator("#hexnac-preview-card h2").first().boundingBox();
  const spectrumHeading = await page.locator(".hq-spectrum-card h2").boundingBox();
  assert.ok(Math.abs(previewHeading.y - spectrumHeading.y) < 2, "spectrum should align with the preview heading");
  await page.click("#hexnac-run");
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "complete",
    null,
    { timeout: 30000 },
  );
  assert.equal(
    await page.locator('[data-summary="total"]').textContent(),
    "10000",
  );
  assert.equal(
    await page.locator('[data-summary="glcnac"]').textContent(),
    "9452",
  );
  assert.equal(
    await page.locator('[data-summary="galnac"]').textContent(),
    "548",
  );
  assert.equal(await page.locator("#hexnac-progress").getAttribute("value"), "10000");
  await page.close();
});

test("mobile spectrum details and skipped reasons remain readable with keyboard selection", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`, { waitUntil: "domcontentloaded" });
  await page.setInputFiles("#hexnac-file", {
    name: "mobile-spectrum.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id,f126,f138,f144,f168,f186\nfirst,0,100,0,0,0\nsecond,0.001,0.2500,0.005,0,0\nbad,,2,3,4,5",
    ),
  });
  await page.waitForFunction(() => document.querySelector("#hexnac-status").dataset.state === "ready");
  const secondRow = page.locator("#hexnac-preview-body tr").nth(1);
  await secondRow.evaluate((row) => {
    row.scrollIntoView({ block: "center", behavior: "instant" });
    row.focus({ preventScroll: true });
  });
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#hexnac-selected-row strong").textContent(), "second");
  assert.match(await page.locator("#hexnac-selected-row span").textContent(), /CSV row 3/);
  assert.deepEqual(await page.locator("#hexnac-spectrum-values dd").allTextContents(), ["0.001", "0.2500", "0.005", "0", "0"]);
  assert.equal(await secondRow.getAttribute("aria-current"), "true");
  assert.equal(await page.locator("#hexnac-preview-body tr").first().getAttribute("aria-current"), null);
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) < 2, "Space should select without scrolling the page");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const table = document.querySelector(".hq-skipped-table");
      const region = table.parentElement;
      const reason = table.querySelector("tbody td:last-child").getBoundingClientRect();
      const regionBounds = region.getBoundingClientRect();
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        region: region.clientWidth,
        content: region.scrollWidth,
        reasonFits: reason.left >= regionBounds.left && reason.right <= regionBounds.right,
        labelSize: parseFloat(getComputedStyle(document.querySelector(".hq-spectrum-labels")).fontSize),
      };
    });
    assert.equal(layout.document, layout.viewport);
    assert.ok(layout.content <= layout.region + 1, `skipped reasons overflow at ${width}px`);
    assert.ok(layout.reasonFits, `skipped reason is clipped at ${width}px`);
    assert.ok(layout.labelSize >= 13, "fragment labels should remain readable");
  }
  await page.close();
});

test("cancels active prediction, discards output, and permits selecting the same file again", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`, {
    waitUntil: "domcontentloaded",
  });
  // Keep prediction active long enough for a user click across browser engines.
  // The 10,000-row golden corpus can finish before Cancel receives the click.
  const input = {
    name: "cancellable.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`id,f126,f138,f144,f168,f186\n${"row,1,2,3,4,5\n".repeat(250000)}`),
  };
  await page.setInputFiles("#hexnac-file", input);
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "ready",
  );
  await page.click("#hexnac-run");
  await page.click("#hexnac-cancel");
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "cancelled",
  );
  assert.equal(await page.locator("#hexnac-results-body tr").count(), 0);
  assert.equal(await page.locator("#hexnac-run").isDisabled(), true);
  assert.equal(await page.locator("#hexnac-file").inputValue(), "");
  await page.setInputFiles("#hexnac-file", input);
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "ready",
  );
  assert.equal(await page.locator("#hexnac-run").isEnabled(), true);
  await page.close();
});

test("ignores an older file read that finishes after a newer selection", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function delayedArrayBuffer() {
      const buffer = await original.call(this);
      if (this.name === "first.csv") {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return buffer;
    };
  });
  const csv = (id) =>
    Buffer.from(`id,f126,f138,f144,f168,f186\n${id},1,2,3,4,5`);
  await page.setInputFiles("#hexnac-file", {
    name: "first.csv",
    mimeType: "text/csv",
    buffer: csv("FIRST"),
  });
  await page.setInputFiles("#hexnac-file", {
    name: "second.csv",
    mimeType: "text/csv",
    buffer: csv("SECOND"),
  });
  await page.waitForFunction(
    () => document.querySelector("#hexnac-status").dataset.state === "ready",
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator("#hexnac-preview-body tr").first().locator("td").first().textContent(),
    "SECOND",
  );
  await page.close();
});

test(
  "rejecting a new oversized file terminates and discards an older prediction",
  { timeout: 60000 },
  async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/hexnac-quest/analysis/`, {
      waitUntil: "domcontentloaded",
    });
    const largeValidCsv = Buffer.from(
      `id,f126,f138,f144,f168,f186\n${"row,1,2,3,4,5\n".repeat(250000)}`,
    );
    await page.setInputFiles("#hexnac-file", {
      name: "long-running.csv",
      mimeType: "text/csv",
      buffer: largeValidCsv,
    });
    await page.waitForFunction(
      () => document.querySelector("#hexnac-status").dataset.state === "ready",
      null,
      { timeout: 30000 },
    );
    await page.click("#hexnac-run");
    await page.setInputFiles("#hexnac-file", {
      name: "too-large.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#hexnac-status").dataset.state === "error" &&
        document.querySelector("#hexnac-status").textContent.includes("25 MB"),
    );
    await page.waitForTimeout(750);
    assert.equal(
      await page.locator("#hexnac-status").getAttribute("data-state"),
      "error",
    );
    assert.equal(await page.locator("#hexnac-results-body tr").count(), 0);
    assert.equal(await page.locator("#hexnac-results-card").isHidden(), true);
    assert.equal(await page.locator("#hexnac-run").isDisabled(), true);
    await page.close();
  },
);
