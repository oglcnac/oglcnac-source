const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = path.join(ROOT, "frontend");
const GOLDEN = require("./fixtures/prediction-golden.json");
const MIME_TYPES = {
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

let server;
let browser;
let baseUrl;
const browserName = process.env.PREDICTION_BROWSER || "chromium";
const browserType = playwright[browserName];

if (!browserType) {
  throw new Error(`Unsupported PREDICTION_BROWSER: ${browserName}`);
}

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let filePath = path.join(STATIC_ROOT, requestPath);
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }
  if (!filePath.startsWith(STATIC_ROOT)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
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
  if (browser) {
    await browser.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const reference of [
  { species: "human", score: "0.796" },
  { species: "mouse", score: "0.709" },
]) {
  test(`runs ${reference.species} prediction entirely from static browser assets`, async () => {
    const page = await browser.newPage();
    const apiRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("api.oglcnac.org")) {
        apiRequests.push(request.url());
      }
    });
    await page.route("https://api.oglcnac.org/**", (route) => route.abort());
    await page.goto(`${baseUrl}/pred_dl/input_fasta/`, {
      waitUntil: "domcontentloaded",
    });
    if (reference.species === "mouse") {
      await page.check('#prediction-text-form input[value="mouse"]');
    }
    await page.fill(
      "#message",
      ">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA",
    );
    await page.click('#prediction-text-form button[type="submit"]');
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#prediction-results-body tr").length > 0 ||
        getComputedStyle(document.querySelector("#prediction-error")).display !== "none",
      null,
      { timeout: 120000 },
    );

    assert.equal(await page.locator("#prediction-results-body tr").count(), 1);
    const cells = await page
      .locator("#prediction-results-body tr")
      .first()
      .locator("td")
      .allTextContents();
    assert.deepEqual(cells, ["SEQ1", "15", "S", reference.score, "+"]);
    assert.deepEqual(apiRequests, []);
    await page.close();
  });
}

test("reports a local validation error when FASTA has no candidate sites", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/pred_dl/input_fasta/`, {
    waitUntil: "domcontentloaded",
  });
  await page.fill("#message", ">PREVIOUS\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA");
  await page.click('#prediction-text-form button[type="submit"]');
  await page.waitForFunction(
    () => document.querySelectorAll("#prediction-results-body tr").length === 1,
    null,
    { timeout: 30000 },
  );
  await page.fill("#message", ">NO_SITES\nAAAAAAAAAAAAAAAAAAAA");
  await page.click('#prediction-text-form button[type="submit"]');

  await assert.doesNotReject(() =>
    page.waitForFunction(
      () =>
        document.querySelector("#prediction-error").textContent.includes(
          "No S/T residues",
        ),
      null,
      { timeout: 5000 },
    ),
  );
  assert.equal(await page.locator("#prediction-results-body tr").count(), 0);
  assert.equal(
    await page.locator("#prediction-results-card").evaluate(
      (element) => getComputedStyle(element).display,
    ),
    "none",
  );
  await page.close();
});

test("can cancel an in-browser prediction", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/pred_dl/input_fasta/`, {
    waitUntil: "domcontentloaded",
  });
  await page.fill("#message", `>CANCEL\n${"ST".repeat(900)}`);
  await page.click('#prediction-text-form button[type="submit"]');
  await page.click("#prediction-cancel");
  await page.waitForFunction(
    () =>
      document.querySelector("#prediction-error").textContent.includes(
        "cancelled",
      ),
    null,
    { timeout: 30000 },
  );
  assert.equal(await page.locator("#prediction-results-body tr").count(), 0);
  await page.close();
});

test(
  "matches every displayed row in the Python golden FASTA corpus",
  { timeout: 180000 },
  async () => {
    const page = await browser.newPage();
    const apiRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("api.oglcnac.org")) {
        apiRequests.push(request.url());
      }
    });
    await page.route("https://api.oglcnac.org/**", (route) => route.abort());
    await page.goto(`${baseUrl}/pred_dl/input_fasta/`, {
      waitUntil: "domcontentloaded",
    });

    for (const goldenCase of GOLDEN.cases) {
      const fasta = await fs.readFile(
        path.join(STATIC_ROOT, goldenCase.fasta_path),
        "utf8",
      );
      await page.check(
        `#prediction-text-form input[value="${goldenCase.species}"]`,
      );
      await page.fill("#message", fasta);
      await page.click('#prediction-text-form button[type="submit"]');
      await page.waitForFunction(
        (expectedRows) =>
          window.jQuery &&
          jQuery.fn.dataTable.isDataTable("#prediction-results-table") &&
          jQuery("#prediction-results-table").DataTable().rows().count() ===
            expectedRows,
        goldenCase.results.length,
        { timeout: 120000 },
      );
      const actual = await page.evaluate(() =>
        jQuery("#prediction-results-table")
          .DataTable()
          .rows()
          .data()
          .toArray()
          .map((row) => Array.from(row, (value) => String(value))),
      );
      const expected = goldenCase.results.map((record) => [
        record.id,
        String(record.position),
        record.residue,
        record.score,
        record.confidence,
      ]);
      assert.deepEqual(actual, expected, goldenCase.name);
    }

    assert.deepEqual(apiRequests, []);
    await page.close();
  },
);
