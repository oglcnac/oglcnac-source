const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STATIC_ROOT = process.env.SITE_STATIC_ROOT || path.join(ROOT, "dist");
const requestedBrowserName = process.env.SITE_BROWSER || "chromium";
const browserType = playwright[requestedBrowserName];
if (!browserType) {
  throw new Error(`Unsupported SITE_BROWSER: ${requestedBrowserName}`);
}
const MIME_TYPES = {
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".fasta": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
    const body = await fs.readFile(path.join(STATIC_ROOT, "404.html"));
    response.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(body);
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
  if (formId === "atlas-search-form" && tableId === "search_result") await page.click("#atlas-view-evidence");
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

function rgbChannels(cssColor) {
  const channels = cssColor.match(/[\d.]+/g);
  assert.ok(channels && channels.length >= 3, `Unsupported CSS color: ${cssColor}`);
  return channels.slice(0, 3).map(Number);
}

function contrastRatio(first, second) {
  const luminance = (channels) => {
    const [red, green, blue] = channels.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
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

test("site interaction QA uses the requested browser engine", () => {
  assert.equal(browser.browserType().name(), requestedBrowserName);
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
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => window.__oglcnacCopiedText || "",
        writeText: async (text) => {
          window.__oglcnacCopiedText = String(text);
        },
      },
    });
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

test("native table headers expose the active sort direction", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/atlas/browse/?species=Human`);
  await waitForTable(page, "search_result");

  const headers = page.locator("#search_result thead th");
  assert.deepEqual(
    await headers.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-sort")),
    ),
    ["none", "none", "none", "none", "none", "none"],
  );

  const accession = headers.nth(4);
  const sortButton = accession.locator("button");
  await sortButton.click();
  assert.equal(await accession.getAttribute("aria-sort"), "ascending");
  assert.match(await sortButton.getAttribute("aria-label"), /ascending/i);

  await sortButton.click();
  assert.equal(await accession.getAttribute("aria-sort"), "descending");
  assert.match(await sortButton.getAttribute("aria-label"), /descending/i);
  await page.close();
});

test("mobile OGT-PIN cards show the searched interactor and preserve every field", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/ogt-pin/search/?q=Q9H1M0&field=uuid_b`);
  await waitForTable(page, "search_result");
  const card = page.locator(".native-record-card").first();
  assert.equal(await card.isVisible(), true);
  assert.match(await card.textContent(), /Q9H1M0.*View evidence/);
  assert.match(await card.textContent(), /NUP62CL/);
  await card.locator("summary").click();
  assert.equal(await card.locator("dt").count(), 6);
  assert.equal(await page.locator("#search_result").isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const targets = await card.locator("a").evaluateAll(links => links.map(link => ({height:link.getBoundingClientRect().height, label:link.textContent})));
  assert.ok(targets.every(target => target.height >= 24), JSON.stringify(targets));
  await page.close();
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
        `[data-table-pagination-for="${tableId}"] select`,
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

test("Atlas evidence renders completely while a missing local sequence fallback is pending", async () => {
  const page = await browser.newPage();
  await page.route("**/static/data/atlas-v2/records/*.json*", async (route) => {
    const response = await route.fetch();
    const bucket = await response.json();
    delete bucket.snapshot.sequences.P18583;
    bucket.snapshot.missing_accessions.push("P18583");
    await route.fulfill({ response, json: bucket });
  });
  let releaseFallback;
  const fallbackReleased = new Promise((resolve) => {
    releaseFallback = resolve;
  });
  await page.route("https://rest.uniprot.org/**", async (route) => {
    await fallbackReleased;
    await route.abort();
  });

  await page.goto(`${baseUrl}/atlas/detail/?id=P18583`);
  let evidence;
  try {
    await page.waitForFunction(
      () => {
        const table = window.OglcnacTables && window.OglcnacTables.get("detail2");
        return table && !table.loading;
      },
      null,
      { timeout: 1500 },
    );
    evidence = await page.evaluate(() => {
      const table = window.OglcnacTables.get("detail2");
      return {
        totalRows: table.totalRows,
        recordState: document.querySelector('[data-record-state="atlas"]').dataset
          .state,
      };
    });
  } finally {
    releaseFallback();
  }
  assert.ok(evidence.totalRows > 0, evidence);
  assert.equal(evidence.recordState, "ready");

  await assert.doesNotReject(() =>
    page.getByText(/Protein sequence.*not available/i).waitFor({ state: "attached" }),
  );
  await page.close();
});

test("Atlas statistics separates current release metrics from historical figures", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/atlas/statistics/`);
  await page.locator('[data-atlas-release-state="ready"]').waitFor();

  assert.equal(
    await page.locator('[data-atlas-metric="total"]').textContent(),
    "61,035",
  );
  assert.equal(
    await page.locator('[data-atlas-metric="dataset-i"]').textContent(),
    "46,517",
  );
  assert.equal(
    await page.locator('[data-atlas-metric="dataset-ii"]').textContent(),
    "14,518",
  );
  assert.match(
    await page.locator("[data-historical-publication-statistics]").textContent(),
    /historical.*not current live release metrics/i,
  );
  await page.close();
});

test("OGT-PIN statistics filters the readable network and preserves publication figures", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/ogt-pin/statistics/`);
  await page.waitForFunction(() => document.querySelector("#ogt-summary-metrics")?.textContent.includes("3,757"));
  assert.equal(await page.locator("#ogt-network-nodes a").count(), 12);
  await page.selectOption("#ogt-network-species", { label: "Mus musculus (Mouse)" });
  await page.waitForFunction(() => !document.querySelector("#ogt-summary-metrics")?.textContent.includes("3,757"));
  assert.ok(await page.locator("#ogt-network-nodes a").count() > 0);
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("OGT-Interactome-760.svg"))), false);
  await page.locator(".historical-figures > summary").click();
  await page.waitForFunction(() => document.querySelector(".historical-figures img[src*=\"OGT-Interactome-760\"]")?.naturalWidth > 0);
  assert.equal(await page.locator('.historical-figures img[src^="/static/img/OGT-Interactome-760.svg"]').isVisible(), true);
  await page.close();
});

test("result surfaces announce empty and data-load error states", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/atlas/search/?q=NOT-A-REAL-ACCESSION&field=accession`);
  await waitForTable(page, "search_result");
  await assert.doesNotReject(() =>
    page.locator('[data-table-state="empty"]').first().waitFor(),
  );
  assert.match(
    await page.locator('[data-table-status-for="search_result"]').textContent(),
    /No matching records/i,
  );

  await page.route("**/static/data/atlas-v2/manifest.json*", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await waitForTable(page, "search_result");
  await assert.doesNotReject(() =>
    page.locator('[data-table-state="error"]').first().waitFor(),
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

test("desktop section navigation is visible without interaction", async () => {
  const expected = {
    "/atlas/": "/atlas/statistics/",
    "/ogt-pin/": "/ogt-pin/statistics/",
    "/pred_dl/": "/pred_dl/download/",
    "/hexnac-quest/": "/hexnac-quest/contact/",
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  for (const [route, destination] of Object.entries(expected)) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const disclosure = page.locator(".site-nav-disclosure");
    assert.equal(
      await disclosure.getAttribute("open"),
      "",
      `${route} desktop navigation disclosure must be open`,
    );
    assert.equal(
      await page
        .locator(`.site-section-nav a[href="${destination}"]`)
        .isVisible(),
      true,
      `${route} hides desktop section link ${destination}`,
    );
  }
  await page.close();
});

test("portal navigation stays fixed while each tool has its own navigation region", async () => {
  const routes = ["/atlas/", "/ogt-pin/", "/pred_dl/", "/hexnac-quest/"];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  const baseline = await page.evaluate(() => {
    const { left, right, top, bottom } = document
      .querySelector(".site-primary-nav")
      .getBoundingClientRect();
    return { left, right, top, bottom };
  });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      return {
        portal: rect(".site-primary-nav"),
        tool: rect(".site-section-nav"),
        panel: rect(".site-nav-panel"),
      };
    });

    assert.ok(
      Math.abs(layout.portal.left - baseline.left) <= 1 &&
        Math.abs(layout.portal.right - baseline.right) <= 1 &&
        Math.abs(layout.portal.top - baseline.top) <= 1 &&
        Math.abs(layout.portal.bottom - baseline.bottom) <= 1,
      `${route} shifts the portal navigation from its home-page position`,
    );

    assert.ok(
      layout.tool.top >= layout.portal.bottom,
      `${route} section navigation should sit below the primary navigation`,
    );
    assert.ok(
      Math.abs(layout.tool.left - layout.panel.left) <= 1,
      `${route} section navigation should align with the navigation panel`,
    );
  }

  await page.close();
});

test("tool home pages expose every resource without opening the header menu", async () => {
  const expected = {
    "/atlas/": [
      "/atlas/statistics/",
      "/atlas/search/",
      "/atlas/browse/",
      "/atlas/tutorial/",
      "/atlas/download/",
      "/atlas/contact/",
    ],
    "/ogt-pin/": [
      "/ogt-pin/statistics/",
      "/ogt-pin/search/",
      "/ogt-pin/tutorial/",
      "/ogt-pin/contact/",
    ],
    "/pred_dl/": [
      "/pred_dl/input_fasta/",
      "/pred_dl/tutorial/",
      "/pred_dl/download/",
      "/pred_dl/contact/",
    ],
    "/hexnac-quest/": [
      "/hexnac-quest/analysis/",
      "/hexnac-quest/tutorial/",
      "/hexnac-quest/contact/",
    ],
  };
  for (const width of [1024, 390]) {
    for (const [route, links] of Object.entries(expected)) {
      // Each route is an independent directory check; navigation behavior has its own tests.
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
      for (const href of links) {
        const link = page.locator(
          `main .resource-directory a[href="${href}"]`,
        );
        assert.equal(
          await link.count(),
          1,
          `${route} must expose ${href} once in main content at ${width}px`,
        );
        assert.equal(
          await link.isVisible(),
          true,
          `${route} hides ${href} in main content at ${width}px`,
        );
      }
      await page.close();
    }
  }
});

test("unknown routes retain a useful 404 page while legacy detail paths redirect", async () => {
  const page = await browser.newPage();
  const response = await page.goto(`${baseUrl}/missing-publication-page`);
  assert.equal(response.status(), 404);
  await page.waitForTimeout(100);
  assert.equal(new URL(page.url()).pathname, "/missing-publication-page");
  assert.equal(
    await page.getByRole("heading", { level: 1 }).textContent(),
    "Resource not found",
  );
  await assert.doesNotReject(() =>
    page.getByRole("link", { name: "Return to oglcnac.org" }).waitFor(),
  );

  await page.goto(`${baseUrl}/atlas/detail/P18583`);
  await page.waitForURL("**/atlas/detail/?id=P18583");
  await page.close();
});

test("shared focus and reduced-motion styles are observable", async () => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`);
  await page.locator(".site-brand").focus();
  const focused = await page.locator(".site-brand").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      surfaceColor: getComputedStyle(element.closest(".site-header")).backgroundColor,
    };
  });
  assert.notEqual(focused.outlineStyle, "none");
  assert.notEqual(focused.outlineWidth, "0px");
  assert.notEqual(focused.outlineColor, "rgba(0, 0, 0, 0)");
  assert.notEqual(focused.boxShadow, "none");
  assert.ok(
    contrastRatio(
      rgbChannels(focused.outlineColor),
      rgbChannels(focused.surfaceColor),
    ) >= 3,
    `focus outline lacks 3:1 contrast against the header: ${JSON.stringify(focused)}`,
  );

  const lightSurfaceFocus = await page.locator("#portal-search-term").first().evaluate((element) => {
    element.focus();
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      outlineColor: style.outlineColor,
    };
  });
  assert.ok(
    contrastRatio(
      rgbChannels(lightSurfaceFocus.outlineColor),
      rgbChannels(lightSurfaceFocus.backgroundColor),
    ) >= 3,
    `focus outline lacks 3:1 contrast on a light surface: ${JSON.stringify(lightSurfaceFocus)}`,
  );

  const motion = await page.locator("#portal-search-term").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  assert.match(motion.animationDuration, /^(0s|0\.001s)$/);
  assert.match(motion.transitionDuration, /^(0s|0\.001s)(, (0s|0\.001s))*$/);
  await context.close();
});

test("PRED-DL title stays inside its desktop content column", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${baseUrl}/pred_dl/`);
  const bounds = await page.evaluate(() => {
    const title = document.querySelector(".resource-hero h1");
    const container = document.querySelector(".resource-hero .container");
    return {
      titleRight: title.getBoundingClientRect().right,
      titleScrollWidth: title.scrollWidth,
      titleClientWidth: title.clientWidth,
      containerRight: container.getBoundingClientRect().right,
    };
  });
  assert.ok(
    bounds.titleScrollWidth <= bounds.titleClientWidth &&
      bounds.titleRight <= bounds.containerRight,
    `PRED-DL title exceeds its content column: ${JSON.stringify(bounds)}`,
  );
  await page.close();
});

test("PRED-DL species controls stay compact on desktop", async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${baseUrl}/pred_dl/input_fasta/`);
  const controls = await page
    .locator('.species-control input[type="radio"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        };
      }),
    );
  assert.ok(
    controls.every(({ width, height }) => width <= 24 && height <= 24),
    `PRED-DL radio controls are oversized: ${JSON.stringify(controls)}`,
  );
  await page.close();
});

test("wide desktop layouts use the available canvas", async () => {
  const routes = [
    "/",
    "/atlas/",
    "/atlas/statistics/",
    "/atlas/search/",
    "/atlas/browse/",
    "/atlas/tutorial/",
    "/atlas/download/",
    "/atlas/contact/",
    "/ogt-pin/",
    "/ogt-pin/statistics/",
    "/ogt-pin/search/",
    "/ogt-pin/tutorial/",
    "/ogt-pin/contact/",
    "/pred_dl/",
    "/pred_dl/input_fasta/",
    "/pred_dl/tutorial/",
    "/pred_dl/download/",
    "/pred_dl/contact/",
    "/hexnac-quest/",
    "/hexnac-quest/analysis/",
    "/hexnac-quest/tutorial/",
    "/hexnac-quest/contact/",
  ];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const layout = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          "main > section > .container, main > section > .hq-container, .portal-home-inner",
        ),
      ).filter((element) => element.getBoundingClientRect().width > 0);
      return {
        viewport: document.documentElement.clientWidth,
        widest: Math.round(
          Math.max(...candidates.map((element) => element.getBoundingClientRect().width)),
        ),
      };
    });
    // The homepage directory is a reading surface; data and tool pages use
    // the wider canvas for tables, forms, and scientific figures.
    const minimumWidth = route === "/" ? 1300 : 1500;
    assert.ok(
      layout.widest >= minimumWidth,
      `${route} only uses ${layout.widest}px of a ${layout.viewport}px desktop canvas`,
    );
  }
  await page.close();
});

test("homepage exposes direct Atlas search and all five research resources", async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${baseUrl}/`);
  assert.equal(await page.locator(".resource-directory-row").count(), 5);
  for (const href of ["/atlas/search/", "/ogt-pin/search/", "/pred_dl/input_fasta/", "/hexnac-quest/analysis/", "/analysis/"]) {
    assert.ok(await page.locator(`.resource-directory a[href="${href}"]`).count() > 0, `Missing direct research action ${href}`);
  }
  for (const width of [1920, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.locator(".portal-search-form").evaluate(element => {
      const r = element.getBoundingClientRect();
      return { top:r.top, bottom:r.bottom, right:r.right, left:r.left, width:innerWidth, documentWidth:document.documentElement.scrollWidth };
    });
    assert.ok(layout.bottom <= 844, `Homepage search must remain above the fold: ${JSON.stringify(layout)}`);
    assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.documentWidth === layout.width, JSON.stringify(layout));
  }
  await page.locator("#portal-search-term").fill("P18583");
  await page.locator(".portal-search-form button[type=submit]").click();
  await page.waitForURL("**/atlas/search/?q=P18583&field=accession");
  await waitForTable(page, "search_result");
  assert.ok(await page.evaluate(() => window.OglcnacTables.get("search_result").totalRows > 0));
  await page.close();
});

test("task-oriented pages expose their primary action above the desktop fold", async () => {
  const checks = {
    "/atlas/search/": ".search-form",
    "/atlas/browse/": ".species-filter",
    "/atlas/download/": ".download-grid",
    "/ogt-pin/search/": ".search-form",
    "/pred_dl/input_fasta/": ".prediction-grid",
    "/pred_dl/download/": ".download-grid",
    "/hexnac-quest/analysis/": ".hq-upload-card",
  };
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [route, selector] of Object.entries(checks)) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const bounds = await page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    });
    assert.ok(
      bounds.top < 720,
      `${route} pushes its primary action too far down: ${JSON.stringify(bounds)}`,
    );
  }

  await page.goto(`${baseUrl}/pred_dl/input_fasta/`, { waitUntil: "load" });
  const cards = await page.locator(".prediction-card").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    }),
  );
  assert.ok(
    cards.every(({ top, bottom }) => top >= 0 && bottom <= 1080),
    `PRED-DL submission cards do not fit in the first desktop viewport: ${JSON.stringify(cards)}`,
  );
  await page.close();
});

test("shared title surfaces are compact and leave room for useful content", async () => {
  const headingChecks = [
    ["/atlas/", ".resource-hero", 380],
    ["/ogt-pin/", ".resource-hero", 380],
    ["/pred_dl/", ".resource-hero", 380],
    ["/atlas/statistics/", ".page-hero", 250],
    ["/atlas/browse/?species=Human", ".page-hero", 250],
    ["/atlas/tutorial/", ".page-hero", 250],
    ["/ogt-pin/statistics/", ".page-hero", 250],
    ["/pred_dl/download/", ".page-hero", 250],
    ["/atlas/search/", ".search-page-heading", 300],
    ["/ogt-pin/search/", ".search-page-heading", 300],
    ["/hexnac-quest/analysis/", ".hq-page-heading", 240],
    ["/hexnac-quest/tutorial/", ".hq-page-heading", 240],
  ];
  const usefulContentChecks = [
    ["/atlas/", ".resource-directory", 450],
    ["/atlas/statistics/", ".metric-grid", 500],
    ["/atlas/search/", ".table-results-section", 390],
    ["/atlas/browse/?species=Human", ".table-results-section", 350],
    ["/ogt-pin/statistics/", ".ogt-network-summary", 380],
    ["/ogt-pin/search/", ".table-results-section", 390],
    ["/pred_dl/", ".resource-directory", 450],
    ["/hexnac-quest/analysis/", ".hq-upload-card", 340],
  ];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [route, selector, maxHeight] of headingChecks) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const height = await page.locator(selector).first().evaluate((element) =>
      Math.round(element.getBoundingClientRect().height),
    );
    assert.ok(
      height <= maxHeight,
      `${route} title surface is ${height}px tall; expected at most ${maxHeight}px`,
    );
  }
  for (const [route, selector, maxTop] of usefulContentChecks) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const top = await page.locator(selector).first().evaluate((element) =>
      Math.round(element.getBoundingClientRect().top),
    );
    assert.ok(
      top <= maxTop,
      `${route} first useful content starts at ${top}px; expected at most ${maxTop}px`,
    );
  }
  await page.close();
});

test("long-form tutorials align headings and body in a readable centered column", async () => {
  const routes = ["/atlas/tutorial/", "/ogt-pin/tutorial/", "/pred_dl/tutorial/"];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const layout = await page.locator(".panel.prose").evaluate((panel) => {
      const container = panel.parentElement;
      const panelBounds = panel.getBoundingClientRect();
      const containerBounds = container.getBoundingClientRect();
      return {
        panelWidth: Math.round(panelBounds.width),
        containerWidth: Math.round(containerBounds.width),
        panelCenter: Math.round((panelBounds.left + panelBounds.right) / 2),
        containerCenter: Math.round((containerBounds.left + containerBounds.right) / 2),
        headingLeft: panel.querySelector("h2").getBoundingClientRect().left,
        paragraphLeft: panel.querySelector("p").getBoundingClientRect().left,
        textWidth: panel.querySelector("p").getBoundingClientRect().width,
      };
    });
    assert.ok(Math.abs(layout.headingLeft - layout.paragraphLeft) <= 1, JSON.stringify(layout));
    assert.ok(layout.textWidth <= 820, JSON.stringify(layout));
    assert.equal(
      layout.panelWidth,
      layout.containerWidth,
      `${route} long-form panel should match the shared content width`,
    );
    assert.ok(
      Math.abs(layout.panelCenter - layout.containerCenter) <= 1,
      `${route} long-form panel is not centered in its content area`,
    );
  }

  await page.close();
});

test("tutorial glossaries use compact two-column entries without repeated dividers", async () => {
  const routes = ["/atlas/tutorial/", "/ogt-pin/tutorial/"];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const glossary = await page.locator(".terms-list").evaluate((list) => {
      const entry = list.querySelector("li");
      const styles = getComputedStyle(list);
      const bounds = list.getBoundingClientRect();
      return {
        columns: styles.gridTemplateColumns.split(" ").length,
        height: Math.round(bounds.height),
        dividerWidth: getComputedStyle(entry).borderBottomWidth,
      };
    });
    assert.equal(glossary.columns, 2, `${route} glossary should use two desktop columns`);
    assert.equal(glossary.dividerWidth, "0px", `${route} glossary should not repeat row dividers`);
    assert.ok(
      glossary.height <= 650,
      `${route} glossary remains too tall at ${glossary.height}px`,
    );
  }

  await page.close();
});

test("desktop result tables keep titles, controls, and record counts on one compact row", async () => {
  const routes = ["/atlas/browse/?species=Human", "/ogt-pin/search/?q=Q9H1M0&field=uuid_b"];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    await waitForTable(page, "search_result");
    const layout = await page.evaluate(() => {
      const bounds = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { top, bottom, height } = element.getBoundingClientRect();
        return { top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) };
      };
      return {
        header: bounds(".table-card-header"),
        controls: bounds(".native-table-controls"),
        status: bounds(".native-table-status"),
        table: bounds(".table-scroll"),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    const rowTop = Math.min(layout.header.top, layout.controls.top, layout.status.top);
    const rowBottom = Math.max(
      layout.header.bottom,
      layout.controls.bottom,
      layout.status.bottom,
    );
    assert.ok(
      rowBottom - rowTop <= 52,
      `${route} table controls occupy ${rowBottom - rowTop}px instead of one compact row`,
    );
    assert.ok(
      layout.table.top - rowBottom <= 18,
      `${route} leaves ${layout.table.top - rowBottom}px between its controls and table`,
    );
    assert.equal(layout.overflow, 0, `${route} introduces desktop horizontal overflow`);
  }

  await page.close();
});

test("all public content pages reflow without horizontal overflow", async () => {
  const routes = require(path.join(ROOT, "site/site.json")).pages
    .filter(page => !page.route.startsWith("/research/"))
    .map(page => page.output === "404.html" ? "/404.html" : page.route)
    .map(route => route === "/atlas/detail/" ? `${route}?id=P18583` : route === "/ogt-pin/detail/" ? `${route}?id=Q9H1M0` : route);
  for (const width of [320, 390, 768, 1440, 1920]) {
    for (const route of routes) {
      // Isolate layout checks across engines. The local WPE runtime can crash on
      // repeated navigation even with plain HTML (documented in visual-review).
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        offenders: Array.from(document.querySelectorAll("*"))
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`,
              right: Math.round(bounds.right),
              width: Math.round(bounds.width),
            };
          })
          .filter(
            (entry) =>
              entry.right > document.documentElement.clientWidth + 1 ||
              entry.width > document.documentElement.clientWidth + 1,
          )
          .slice(0, 8),
      }));
      assert.ok(
        overflow.document <= overflow.viewport && overflow.body <= overflow.viewport,
        `${route} overflows at ${width}px: ${JSON.stringify(overflow)}`,
      );
      await page.close();
    }
  }
});

test("mobile page titles remain compact, contained, and separated from adjacent copy", async () => {
  const routes = [
    "/",
    "/atlas/",
    "/atlas/statistics/",
    "/atlas/search/",
    "/atlas/browse/",
    "/atlas/tutorial/",
    "/atlas/download/",
    "/atlas/contact/",
    "/ogt-pin/",
    "/ogt-pin/statistics/",
    "/ogt-pin/search/",
    "/ogt-pin/tutorial/",
    "/ogt-pin/contact/",
    "/pred_dl/",
    "/pred_dl/input_fasta/",
    "/pred_dl/tutorial/",
    "/pred_dl/download/",
    "/pred_dl/contact/",
    "/hexnac-quest/",
    "/hexnac-quest/analysis/",
    "/hexnac-quest/tutorial/",
    "/hexnac-quest/contact/",
  ];
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const result = await page.evaluate(() => {
      const title = document.querySelector("h1");
      const bounds = title.getBoundingClientRect();
      const nowrap = Array.from(title.querySelectorAll(".nowrap")).map((node) => {
        const child = node.getBoundingClientRect();
        return {
          left: Math.round(child.left),
          right: Math.round(child.right),
        };
      });
      const visibleSiblings = Array.from(title.parentElement.children).filter(
        (element) =>
          element !== title &&
          getComputedStyle(element).display !== "none" &&
          element.getBoundingClientRect().height > 0,
      );
      const collisions = visibleSiblings
        .map((element) => {
          const sibling = element.getBoundingClientRect();
          const overlaps =
            bounds.left < sibling.right &&
            bounds.right > sibling.left &&
            bounds.top < sibling.bottom &&
            bounds.bottom > sibling.top;
          return overlaps ? element.tagName.toLowerCase() : null;
        })
        .filter(Boolean);
      return {
        fontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        title: {
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
        },
        nowrap,
        collisions,
      };
    });
    assert.ok(
      result.fontSize <= 40,
      `${route} mobile H1 is ${result.fontSize}px: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.title.left >= 0 && result.title.right <= 390,
      `${route} mobile H1 leaves its viewport: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.nowrap.every(
        (bounds) =>
          bounds.left >= result.title.left && bounds.right <= result.title.right,
      ),
      `${route} unbreakable title text leaves its H1: ${JSON.stringify(result)}`,
    );
    assert.deepEqual(
      result.collisions,
      [],
      `${route} mobile H1 overlaps adjacent copy: ${JSON.stringify(result)}`,
    );
    await page.close();
  }
});

test("all navigation destinations remain available across the complete responsive range", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1100, 1150, 1279, 1280, 1440, 1600, 1920, 3840]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${baseUrl}/atlas/`);
    const toggle = page.locator(".site-nav-disclosure > summary");
    if (await toggle.isVisible()) { await toggle.focus(); await page.keyboard.press("Enter"); }
    assert.equal(await page.locator(".site-workbench-link").isVisible(), true, `Workbench missing at ${width}`);
    for (const link of await page.locator(".site-brand, .site-nav-panel a").all()) assert.equal(await link.isVisible(), true, `Hidden navigation at ${width}`);
    await page.locator("#site-search > summary").click();
    assert.equal(await page.locator(".site-search-help a").isVisible(), true, `Search help missing at ${width}`);
    const searchBounds = await page.locator(".site-search-panel").evaluate(panel => {
      const bounds = panel.getBoundingClientRect();
      const controls = [...panel.querySelectorAll('input, select, button')].map(element => element.getBoundingClientRect());
      return controls.every(control => control.left >= bounds.left && control.right <= bounds.right && control.width >= 24);
    });
    assert.equal(searchBounds, true, `Search controls clipped at ${width}`);
    await page.keyboard.press("Escape");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    if (width < 1280) {
      const panelWidth = await page.locator(".site-nav-panel").evaluate(element => element.getBoundingClientRect().width);
      assert.ok(panelWidth >= width * .8, `Menu too narrow at ${width}`);
    }
  }
  await page.close();
});

test("initial and missing-identifier pages offer recovery without empty data tools", async () => {
  const page = await browser.newPage();
  for (const route of ["/atlas/search/", "/ogt-pin/search/", "/atlas/detail/", "/ogt-pin/detail/"]) {
    const requestedData = [];
    const record = request => { if (request.url().includes("/static/data/")) requestedData.push(request.url()); };
    page.on("request", record);
    await page.goto(baseUrl + route);
    assert.equal(await page.locator(".native-table-controls:visible").count(), 0);
    assert.equal(await page.locator("table:visible").count(), 0);
    assert.doesNotMatch(await page.locator("h1").textContent(), /^detail$/i);
    for (const link of await page.locator('.record-section-nav a[href^="#"]:visible').all()) {
      assert.equal(await page.locator(await link.getAttribute('href')).isVisible(), true, 'Record navigation must only link to available sections');
    }
    assert.deepEqual(requestedData, []);
    page.off("request", record);
  }
  await page.close();
});

test("Atlas transient load failure retries successfully without reload", async () => {
  const page = await browser.newPage();
  let failed = false;
  await page.route("**/static/data/atlas-v2/manifest.json*", async route => {
    if (!failed) { failed = true; await route.fulfill({ status: 503, body: "transient fixture" }); }
    else await route.continue();
  });
  await page.goto(`${baseUrl}/atlas/browse/`);
  await page.waitForSelector('[data-table-state="error"]');
  await page.locator('[data-species="mouse"]').click();
  await page.waitForSelector('[data-table-state="ready"]');
  assert.ok(await page.evaluate(() => window.OglcnacTables.get("search_result").totalRows > 0));
  await page.close();
});

test("Atlas query layout stays stable while table scripts are delayed", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let releaseScripts;
  const scriptGate = new Promise(resolve => { releaseScripts = resolve; });
  const intercepted = page.waitForRequest("**/static/js/table-utils.js*");
  await page.route("**/static/js/table-utils.js*", async route => {
    await scriptGate;
    await route.continue();
  });
  try {
    await page.goto(`${baseUrl}/atlas/search/?q=P18583&field=accession`, { waitUntil: "commit" });
    await intercepted;
    await page.locator(".table-results-section").waitFor({ state: "attached" });
    const before = await page.evaluate(() => ({
      formTop: document.querySelector("#atlas-search-form").getBoundingClientRect().top,
      resultsTop: document.querySelector(".table-results-section").getBoundingClientRect().top,
      footerTop: document.querySelector("footer").getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
    assert.ok(before.footerTop >= before.viewportHeight, "Pending results reserve space before external scripts arrive");
    releaseScripts();
    await waitForTable(page, "search_result");
    const after = await page.evaluate(() => ({
      formTop: document.querySelector("#atlas-search-form").getBoundingClientRect().top,
      resultsTop: document.querySelector(".table-results-section").getBoundingClientRect().top,
      total: window.OglcnacTables.get("search_result").totalRows,
    }));
    assert.ok(after.total > 0, "Delayed scripts still complete the query");
    assert.ok(Math.abs(after.formTop - before.formTop) <= 1, "Search form must not jump after script initialization");
    assert.ok(Math.abs(after.resultsTop - before.resultsTop) <= 1, "Result section must not jump after script initialization");
  } finally {
    releaseScripts();
    await page.close();
  }
});

test("global database search is keyboard-operable and routes protein-name searches correctly", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/`);
  await page.locator('.site-brand').focus();
  await page.keyboard.press('/');
  assert.equal(await page.locator('#site-search').evaluate(el => el.open), true);
  await page.waitForFunction(() => document.activeElement.id === 'site-search-term');
  await page.fill('#site-search-term', 'Nucleoporin');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#site-search').evaluate(el => el.open), false);
  assert.equal(await page.locator('.site-brand').evaluate(el => el === document.activeElement), true);
  await page.locator('#site-search > summary').click();
  await page.selectOption('#site-search-resource', 'ogt-pin');
  await page.selectOption('#site-search-field', 'protein_name_b');
  await page.locator('#site-search-form button[type="submit"]').click();
  await page.waitForURL('**/ogt-pin/search/?field=protein_name_b&q=Nucleoporin');
  await waitForTable(page, 'search_result');
  assert.ok(await page.evaluate(() => OglcnacTables.get('search_result').totalRows > 0));
  await page.close();
});

test("Atlas protein view preserves all evidence and shares active view and filters", async () => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/atlas/search/?q=P18583&field=accession`);
  await waitForTable(page, 'atlas_proteins');
  assert.deepEqual(await page.evaluate(() => [OglcnacTables.get('atlas_proteins').totalRows, OglcnacTables.get('search_result').totalRows]), [4, 110]);
  assert.equal(await page.locator('#atlas-view-proteins').getAttribute('aria-pressed'), 'true');
  await page.selectOption('#atlas-position-filter', 'unreported');
  assert.deepEqual(await page.evaluate(() => [OglcnacTables.get('atlas_proteins').totalRows, OglcnacTables.get('search_result').totalRows]), [1, 4]);
  await page.click('#atlas-view-evidence');
  assert.match(page.url(), /view=evidence/);
  assert.match(page.url(), /position=unreported/);
  await page.reload(); await waitForTable(page, 'search_result');
  assert.equal(await page.locator('#atlas-evidence-results').isVisible(), true);
  assert.equal(await page.locator('#atlas-position-filter').inputValue(), 'unreported');
  assert.equal(await page.evaluate(() => OglcnacTables.get('search_result').totalRows), 4);
  await page.click('#atlas-clear-filters');
  assert.equal(await page.evaluate(() => OglcnacTables.get('search_result').totalRows), 110);
  await page.fill('#atlas-search-term', 'unsubmitted draft');
  await page.click('#atlas-view-proteins');
  assert.equal(new URL(page.url()).searchParams.get('q'), 'P18583');
  await context.close();
});

test("record identity, full source export and hidden table columns retain scientific fields", async () => {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/atlas/detail/?id=P18583`);
  await page.waitForSelector('[data-record-state="atlas"][data-state="ready"]');
  assert.match(await page.locator('#atlas-protein-name').textContent(), /Protein SON/);
  assert.equal((await page.locator('#atlas-gene-name').textContent()).trim(), 'SON');
  const source = JSON.parse(await fs.readFile(path.join(ROOT,'public/static/data/atlas-records.json'),'utf8')).filter(record => record.accession === 'P18583');
  const downloadEvent = page.waitForEvent('download'); await page.click('#atlas-download-record');
  const download = await downloadEvent; const csv = await fs.readFile(await download.path(), 'utf8');
  const Papa = require('papaparse'); const parsed = Papa.parse(csv, { header: true });
  assert.equal(parsed.data.length, source.length);
  assert.deepEqual(new Set(parsed.meta.fields), new Set(Object.keys(source[0])));
  for (let i = 0; i < source.length; i++) for (const key of Object.keys(source[i])) assert.equal(parsed.data[i][key], String(source[i][key] ?? ''));
  const tablePanel = page.locator('#atlas-all-fields');
  await tablePanel.locator('.native-column-picker > summary').click();
  const pickerBounds = await tablePanel.locator('.native-column-picker fieldset').boundingBox();
  assert.ok(pickerBounds.y >= 0 && pickerBounds.y + pickerBounds.height <= 720, 'Column choices remain inside a short desktop viewport');
  await tablePanel.getByLabel('condition', { exact: true }).uncheck();
  await tablePanel.locator('.native-column-picker > summary').click();
  const filteredEvent = page.waitForEvent('download'); await page.locator('[data-table-csv-for="detail3"]').click();
  const filteredDownload = await filteredEvent; const filtered = Papa.parse(await fs.readFile(await filteredDownload.path(),'utf8'),{ header:true });
  assert.equal(filtered.data[0].condition, source[0].condition);
  await page.locator('[data-table-reset-for="detail3"]').click();
  assert.equal(await page.evaluate(() => OglcnacTables.get('detail3').hiddenColumns.size), 0);
  await page.goto(`${baseUrl}/ogt-pin/detail/?id=Q9H1M0`); await page.waitForSelector('[data-record-state="ogt-pin"][data-state="ready"]');
  assert.equal(await page.locator('#ogt-gene-name').textContent(), 'NUP62CL');
  assert.match(await page.locator('#ogt-protein-name').textContent(), /Nucleoporin/);
  await context.close();
});

test("analysis examples populate inputs without submitting jobs", async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/pred_dl/input_fasta/`);
  await page.getByRole('button',{ name: 'Load mouse example', exact:true }).click();
  await page.waitForFunction(() => document.getElementById('prediction-example-status').textContent.startsWith('Example loaded'));
  assert.match(await page.locator('#message').inputValue(), /^>/);
  assert.equal(await page.locator('#prediction-text-form input[value="mouse"]').isChecked(), true);
  assert.equal(await page.locator('#prediction-status').isVisible(), false);
  await page.goto(`${baseUrl}/hexnac-quest/analysis/`);
  await page.click('#hexnac-example');
  await page.waitForSelector('#hexnac-status[data-state="ready"]');
  assert.match(await page.locator('#hexnac-input-name').textContent(), /example_input_data.csv/);
  assert.equal(await page.locator('#hexnac-results-card').isVisible(), false);
  assert.equal(await page.locator('#hexnac-run').isEnabled(), true);
  await page.close();
});
