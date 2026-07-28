const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = path.join(ROOT, "frontend");
const MIME_TYPES = {
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".fasta": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

let server;
let browser;
let baseUrl;

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
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
      "Content-Type":
        MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404).end();
  }
}

async function waitForTable(page, tableId) {
  await page.waitForFunction(
    (id) => {
      const table = window.OglcnacTables && window.OglcnacTables.get(id);
      return table && !table.loading;
    },
    tableId,
    { timeout: 30000 },
  );
}

async function setSearch(page, formId, query, field, tableId) {
  await page.fill(`#${formId} [name="q"]`, query);
  await page.selectOption(`#${formId} [name="field"]`, field);
  await page.click(`#${formId} button[type="submit"]`);
  await waitForTable(page, tableId);
}

function csvRecordCount(csv) {
  let records = 1;
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    if (csv[index] === '"') {
      if (quoted && csv[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (csv[index] === "\n" && !quoted) {
      records += 1;
    }
  }
  return csv.endsWith("\n") ? records - 1 : records;
}

test.before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ headless: true });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("Atlas search preserves every field mapping and bounds broad-result DOM rows", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/atlas/search/`);

  for (const [field, query] of [
    ["accession", "P18583"],
    ["protein_name", "Protein SON"],
    ["gene_name", "SON"],
    ["peptide_seq", "ILDSFAAAPVPTTTLVLK"],
    ["species", "human"],
  ]) {
    await setSearch(page, "atlas-search-form", query, field, "search_result");
    assert.ok(
      await page.locator("#atlas-search-results tr").count(),
      `${field} should produce rows`,
    );
    assert.ok(
      (await page.locator("#atlas-search-results tr").count()) <= 10,
      `${field} rendered more than the current page`,
    );
  }

  const state = await page.evaluate(() => {
    const table = window.OglcnacTables.get("search_result");
    return {
      total: table.totalRows,
      rendered: document.querySelectorAll("#atlas-search-results tr").length,
    };
  });
  assert.ok(state.total > 30000, state);
  assert.equal(state.rendered, 10);
  await page.close();
});

test("Atlas browse covers every species, filters, sorts, copies a page, and exports all filtered rows", async () => {
  const context = await browser.newContext({
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/atlas/browse/?species=Human`);
  await waitForTable(page, "search_result");

  for (const species of [
    "Human",
    "mouse",
    "Rat",
    "Drosophila",
    "Arabidopsis",
    "C. Elegans",
    "Others",
  ]) {
    await page.click(`[data-species="${species}"]`);
    await page.waitForFunction(
      ([id, wanted]) => {
        const table = window.OglcnacTables.get(id);
        return table && !table.loading && table.context === wanted;
      },
      ["search_result", species],
      { timeout: 30000 },
    );
    assert.ok(
      await page.locator("#atlas-browse-results tr").count(),
      `${species} should produce rows`,
    );
    assert.ok((await page.locator("#atlas-browse-results tr").count()) <= 10);
  }

  await page.click('[data-species="Human"]');
  await page.waitForFunction(
    () => window.OglcnacTables.get("search_result").context === "Human",
  );
  await page.fill('[data-table-filter-for="search_result"]', "P18583");
  await page.click('#search_result thead th:nth-child(5) button');
  await page.click('[data-table-copy-for="search_result"]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^Accession\tEntry Name\tProtein Name/m);
  assert.ok(copied.split("\n").length <= 11);

  await page.fill('[data-table-filter-for="search_result"]', "human");
  const expected = await page.evaluate(
    () => window.OglcnacTables.get("search_result").filteredRows.length,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.click('[data-table-csv-for="search_result"]');
  const download = await downloadPromise;
  const target = path.join(os.tmpdir(), `oglcnac-table-${Date.now()}.csv`);
  await download.saveAs(target);
  const csv = await fs.readFile(target, "utf8");
  await fs.unlink(target);
  assert.equal(csvRecordCount(csv) - 1, expected);
  await context.close();
});

test("OGT-PIN search preserves every field mapping", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/ogt-pin/search/`);

  for (const [field, query] of [
    ["uuid_a", "O15294"],
    ["gene_name_a", "OGT"],
    ["uuid_b", "Q9H1M0"],
    ["gene_name_b", "NUP62CL"],
    ["species", "Human"],
  ]) {
    await setSearch(
      page,
      "interactome-search-form",
      query,
      field,
      "search_result",
    );
    assert.ok(
      await page.locator("#interactome-search-results tr").count(),
      `${field} should produce rows`,
    );
    assert.ok(
      (await page.locator("#interactome-search-results tr").count()) <= 10,
    );
  }
  await page.close();
});

test(
  "replacement Atlas, OGT-PIN, and PRED-DL results reset table interaction state",
  { timeout: 120000 },
  async () => {
    const page = await browser.newPage();

    async function dirtyState(tableId) {
      await page.fill(
        `[data-table-filter-for="${tableId}"]`,
        "WILL-HIDE-REPLACEMENT",
      );
      await page.selectOption(
        `[data-table-status-for="${tableId}"] + * + .native-table-pagination select`,
        "25",
      );
      await page.click(`#${tableId} thead th:first-child button`);
      await page.click(`#${tableId} thead th:first-child button`);
    }

    async function assertDefaultState(tableId, bodySelector, expectedText) {
      assert.match(
        await page.locator(`${bodySelector} tr`).first().textContent(),
        expectedText,
      );
      assert.deepEqual(
        await page.evaluate((id) => {
          const table = window.OglcnacTables.get(id);
          return {
            filter: table.filterInput.value,
            page: table.page,
            pageSize: table.pageSize,
            selectedPageSize: table.sizeSelect.value,
            sortColumn: table.sortColumn,
            sortDirection: table.sortDirection,
          };
        }, tableId),
        {
          filter: "",
          page: 0,
          pageSize: 10,
          selectedPageSize: "10",
          sortColumn: null,
          sortDirection: "asc",
        },
      );
    }

    await page.goto(`${baseUrl}/atlas/search/`);
    await setSearch(page, "atlas-search-form", "human", "species", "search_result");
    await dirtyState("search_result");
    await setSearch(
      page,
      "atlas-search-form",
      "P18583",
      "accession",
      "search_result",
    );
    await assertDefaultState("search_result", "#atlas-search-results", /P18583/);

    await page.goto(`${baseUrl}/ogt-pin/search/`);
    await setSearch(
      page,
      "interactome-search-form",
      "OGT",
      "gene_name_a",
      "search_result",
    );
    await dirtyState("search_result");
    await setSearch(
      page,
      "interactome-search-form",
      "Q9H1M0",
      "uuid_b",
      "search_result",
    );
    await assertDefaultState(
      "search_result",
      "#interactome-search-results",
      /Q9H1M0/,
    );

    await page.goto(`${baseUrl}/pred_dl/input_fasta/`);
    await page.fill("#message", ">FIRST\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA");
    await page.click('#prediction-text-form button[type="submit"]');
    await page.waitForFunction(
      () =>
        window.OglcnacTables &&
        window.OglcnacTables.get("prediction-results-table")?.rows[0]?.[0] ===
          "FIRST",
      null,
      { timeout: 120000 },
    );
    await dirtyState("prediction-results-table");
    await page.fill("#message", ">RESET\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA");
    await page.click('#prediction-text-form button[type="submit"]');
    await page.waitForFunction(
      () =>
        window.OglcnacTables.get("prediction-results-table")?.rows[0]?.[0] ===
        "RESET",
      null,
      { timeout: 120000 },
    );
    await assertDefaultState(
      "prediction-results-table",
      "#prediction-results-body",
      /RESET/,
    );

    await page.close();
  },
);

test("known and missing Atlas and OGT-PIN detail records have explicit states", async () => {
  const page = await browser.newPage();
  await page.route("https://rest.uniprot.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: ">sp|P18583|SON_HUMAN\nAAAAAAAAAASAAAAAAAAAA\n",
    }),
  );

  await page.goto(`${baseUrl}/atlas/detail/?id=P18583`);
  await waitForTable(page, "detail1");
  assert.ok(await page.locator("#atlas-peptide-rows tr").count());
  assert.equal(
    await page.locator('[data-record-state="atlas"]').getAttribute("data-state"),
    "ready",
  );

  await page.goto(`${baseUrl}/atlas/detail/?id=NOT-A-RECORD`);
  await waitForTable(page, "detail1");
  assert.equal(await page.locator("#atlas-peptide-rows tr").count(), 0);
  await assert.doesNotReject(() =>
    page
      .locator('[data-record-state="atlas"][data-state="empty"]')
      .waitFor(),
  );

  await page.goto(`${baseUrl}/ogt-pin/detail/?id=Q9H1M0`);
  await waitForTable(page, "interactome");
  assert.ok(await page.locator("#interactome-detail-rows tr").count());
  assert.equal(
    await page
      .locator('[data-record-state="ogt-pin"]')
      .getAttribute("data-state"),
    "ready",
  );

  await page.goto(`${baseUrl}/ogt-pin/detail/?id=NOT-A-RECORD`);
  await waitForTable(page, "interactome");
  assert.equal(await page.locator("#interactome-detail-rows tr").count(), 0);
  await assert.doesNotReject(() =>
    page
      .locator('[data-record-state="ogt-pin"][data-state="empty"]')
      .waitFor(),
  );
  await page.close();
});

test("result surfaces announce empty and data-load error states", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/atlas/search/?q=NOT-A-REAL-ACCESSION&field=accession`);
  await waitForTable(page, "search_result");
  await assert.doesNotReject(() =>
    page.locator('[data-table-state="empty"]').waitFor(),
  );
  assert.match(
    await page.locator('[data-table-status-for="search_result"]').textContent(),
    /No matching records/i,
  );

  await page.route("**/static/data/atlas-records.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await waitForTable(page, "search_result");
  await assert.doesNotReject(() =>
    page.locator('[data-table-state="error"]').waitFor(),
  );
  assert.match(
    await page.locator('[data-table-status-for="search_result"]').textContent(),
    /could not be loaded/i,
  );
  await page.close();
});

test("PRED-DL results use the native bounded table without changing model output", { timeout: 120000 }, async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/pred_dl/input_fasta/`);
  await page.fill("#message", `>SEQ1\n${"S".repeat(24)}`);
  await page.click('#prediction-text-form button[type="submit"]');
  await page.waitForFunction(
    () => {
      const table =
        window.OglcnacTables &&
        window.OglcnacTables.get("prediction-results-table");
      return table && table.totalRows === 24;
    },
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator("#prediction-results-body tr").count(), 10);
  assert.equal(
    await page
      .locator("#prediction-results-body tr")
      .first()
      .locator("td")
      .first()
      .textContent(),
    "SEQ1",
  );
  await page.close();
});

test("mobile navigation opens with keyboard-accessible links", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/atlas/search/`);
  const disclosure = page.locator(".site-nav-disclosure");
  assert.equal(await disclosure.getAttribute("open"), null);
  await page.locator(".site-nav-disclosure > summary").focus();
  await page.keyboard.press("Enter");
  assert.notEqual(await disclosure.getAttribute("open"), null);
  await assert.doesNotReject(() =>
    page.getByRole("link", { name: "Browse", exact: true }).waitFor(),
  );
  await page.close();
});
