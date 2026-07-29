"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:8771";
const outputDir = path.resolve(
  process.env.SCREENSHOT_OUTPUT_DIR || "visual-review",
);
const strict = process.env.SCREENSHOT_STRICT !== "0";
const captureMode = process.env.SCREENSHOT_MODE || "audit";

const viewports = [
  ["wide", { width: 1920, height: 1080 }],
  ["desktop", { width: 1440, height: 1100 }],
  ["mobile", { width: 390, height: 844 }],
];

const waitForTable = (id) => async (page) => {
  await page.waitForFunction(
    (tableId) => {
      const table = window.OglcnacTables?.get(tableId);
      return table && !table.loading;
    },
    id,
    { timeout: 60000 },
  );
};

const waitForSelector = (selector) => async (page) => {
  await page.locator(selector).waitFor({ timeout: 60000 });
};

const captures = [
  { group: "suite", route: "/", name: "home" },
  {
    group: "suite",
    route: "/",
    name: "home-navigation-open",
    act: async (page) => {
      const toggle = page.locator(".site-nav-disclosure > summary");
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.locator(".site-nav-disclosure[open]").waitFor();
      }
    },
  },
  { group: "suite", route: "/404.html", name: "not-found" },

  { group: "atlas", route: "/atlas/", name: "atlas-home" },
  {
    group: "atlas",
    route: "/atlas/statistics/",
    name: "atlas-statistics",
    ready: waitForSelector('[data-atlas-release-state="ready"]'),
  },
  { group: "atlas", route: "/atlas/search/", name: "atlas-search" },
  {
    group: "atlas",
    route: "/atlas/search/?q=P18583&field=accession",
    name: "atlas-search-results",
    ready: waitForTable("search_result"),
  },
  {
    group: "atlas",
    route: "/atlas/search/?q=NOT-A-REAL-ACCESSION&field=accession",
    name: "atlas-search-empty",
    ready: waitForSelector('[data-table-state="empty"]'),
  },
  {
    group: "atlas",
    route: "/atlas/search/?q=P18583&field=accession",
    name: "atlas-search-error",
    prepare: async (page) => {
      await page.route("**/static/data/atlas-records.json*", (route) =>
        route.fulfill({ status: 503, body: "visual audit fixture" }),
      );
    },
    expectedConsole: /status of 503/i,
    ready: waitForSelector('[data-table-state="error"]'),
  },
  { group: "atlas", route: "/atlas/browse/", name: "atlas-browse" },
  {
    group: "atlas",
    route: "/atlas/browse/?species=Human",
    name: "atlas-browse-results",
    ready: waitForTable("search_result"),
  },
  {
    group: "atlas",
    route: "/atlas/detail/?id=P18583",
    name: "atlas-detail",
    ready: waitForSelector('[data-record-state="atlas"][data-state="ready"]'),
  },
  {
    group: "atlas",
    route: "/atlas/detail/?id=NOT-A-RECORD",
    name: "atlas-detail-empty",
    ready: waitForSelector('[data-record-state="atlas"][data-state="empty"]'),
  },
  { group: "atlas", route: "/atlas/tutorial/", name: "atlas-tutorial" },
  { group: "atlas", route: "/atlas/download/", name: "atlas-download" },
  { group: "atlas", route: "/atlas/contact/", name: "atlas-contact" },

  { group: "ogt-pin", route: "/ogt-pin/", name: "ogt-pin-home" },
  {
    group: "ogt-pin",
    route: "/ogt-pin/statistics/",
    name: "ogt-pin-statistics",
  },
  { group: "ogt-pin", route: "/ogt-pin/search/", name: "ogt-pin-search" },
  {
    group: "ogt-pin",
    route: "/ogt-pin/search/?q=Q9H1M0&field=uuid_b",
    name: "ogt-pin-search-results",
    ready: waitForTable("search_result"),
  },
  {
    group: "ogt-pin",
    route: "/ogt-pin/search/?q=NOT-A-REAL-ACCESSION&field=uuid_b",
    name: "ogt-pin-search-empty",
    ready: waitForSelector('[data-table-state="empty"]'),
  },
  {
    group: "ogt-pin",
    route: "/ogt-pin/search/?q=Q9H1M0&field=uuid_b",
    name: "ogt-pin-search-error",
    prepare: async (page) => {
      await page.route("**/static/data/ogt-pin-records.json*", (route) =>
        route.fulfill({ status: 503, body: "visual audit fixture" }),
      );
    },
    expectedConsole: /status of 503/i,
    ready: waitForSelector('[data-table-state="error"]'),
  },
  {
    group: "ogt-pin",
    route: "/ogt-pin/detail/?id=Q9H1M0",
    name: "ogt-pin-detail",
    ready: waitForSelector(
      '[data-record-state="ogt-pin"][data-state="ready"]',
    ),
  },
  {
    group: "ogt-pin",
    route: "/ogt-pin/detail/?id=NOT-A-RECORD",
    name: "ogt-pin-detail-empty",
    ready: waitForSelector(
      '[data-record-state="ogt-pin"][data-state="empty"]',
    ),
  },
  { group: "ogt-pin", route: "/ogt-pin/tutorial/", name: "ogt-pin-tutorial" },
  { group: "ogt-pin", route: "/ogt-pin/contact/", name: "ogt-pin-contact" },

  { group: "pred-dl", route: "/pred_dl/", name: "pred-dl-home" },
  {
    group: "pred-dl",
    route: "/pred_dl/input_fasta/",
    name: "pred-dl-input",
  },
  {
    group: "pred-dl",
    route: "/pred_dl/input_fasta/",
    name: "pred-dl-result",
    act: async (page) => {
      await page.fill("#message", ">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA");
      await page.click('#prediction-text-form button[type="submit"]');
    },
    ready: waitForSelector("#prediction-results-body tr"),
  },
  {
    group: "pred-dl",
    route: "/pred_dl/input_fasta/",
    name: "pred-dl-error",
    act: async (page) => {
      await page.fill("#message", ">NO_SITES\nAAAAAAAAAAAAAAAAAAAA");
      await page.click('#prediction-text-form button[type="submit"]');
    },
    ready: async (page) => {
      await page.waitForFunction(
        () =>
          document
            .querySelector("#prediction-error")
            .textContent.includes("No S/T residues"),
      );
    },
  },
  { group: "pred-dl", route: "/pred_dl/tutorial/", name: "pred-dl-tutorial" },
  { group: "pred-dl", route: "/pred_dl/download/", name: "pred-dl-download" },
  { group: "pred-dl", route: "/pred_dl/contact/", name: "pred-dl-contact" },

  { group: "hexnac", route: "/hexnac-quest/", name: "hexnac-home" },
  {
    group: "hexnac",
    route: "/hexnac-quest/analysis/",
    name: "hexnac-analysis",
  },
  {
    group: "hexnac",
    route: "/hexnac-quest/analysis/",
    name: "hexnac-result",
    act: async (page) => {
      await page.setInputFiles("#hexnac-file", {
        name: "visual-audit.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          [
            "id,f126,f138,f144,f168,f186",
            "glcnac,0,100,0,0,0",
            "galnac,0,0,100,0,0",
            "skipped,,2,3,4,5",
          ].join("\n"),
        ),
      });
      await page.waitForFunction(
        () => document.querySelector("#hexnac-status").dataset.state === "ready",
      );
      await page.click("#hexnac-run");
    },
    ready: async (page) => {
      await page.waitForFunction(
        () =>
          document.querySelector("#hexnac-status").dataset.state === "complete",
      );
    },
  },
  {
    group: "hexnac",
    route: "/hexnac-quest/analysis/",
    name: "hexnac-error",
    act: async (page) => {
      await page.setInputFiles("#hexnac-file", {
        name: "invalid.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("id,f126\ninvalid,1\n"),
      });
    },
    ready: async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#hexnac-status").dataset.state === "error",
      );
    },
  },
  { group: "hexnac", route: "/hexnac-quest/tutorial/", name: "hexnac-tutorial" },
  { group: "hexnac", route: "/hexnac-quest/contact/", name: "hexnac-contact" },
];

const baselineCaptures = captures.filter(
  (capture) =>
    !/(?:navigation-open|results|empty|error|result)$/.test(capture.name),
);

function cleanName(name) {
  return name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

async function captureState(
  browser,
  viewportName,
  viewport,
  capture,
  useAuditFixture,
) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const forbiddenRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (
      request.url().includes("api.oglcnac.org") ||
      request.url().includes("shinyapps.io")
    ) {
      forbiddenRequests.push(request.url());
    }
  });

  const fileName = `${viewportName}-${cleanName(capture.name)}.png`;
  const filePath = path.join(outputDir, fileName);
  const started = Date.now();
  let status = "ok";
  let title = "";
  let h1 = "";
  let metrics = {};
  let expectedConsoleErrors = [];
  let unexpectedConsoleErrors = [];

  try {
    if (useAuditFixture && capture.prepare) await capture.prepare(page);
    const response = await page.goto(new URL(capture.route, baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    if (!response || response.status() >= 400) {
      status = `http ${response ? response.status() : "none"}`;
    }
    if (!useAuditFixture) {
      await page.waitForTimeout(1200);
    } else if (capture.act) {
      await capture.act(page);
    }
    if (useAuditFixture && capture.ready) {
      await capture.ready(page);
    } else if (useAuditFixture) {
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    }
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(100);
    title = await page.title();
    h1 = (await page.locator("h1").first().textContent().catch(() => "")).trim();
    metrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      h1Count: document.querySelectorAll("h1").length,
      navigationOpen: document
        .querySelector(".site-nav-disclosure")
        ?.hasAttribute("open"),
      skipLinkVisible: (() => {
        const link = document.querySelector(".skip-link");
        if (!link) return false;
        const bounds = link.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      })(),
    }));
    if (
      metrics.documentWidth > metrics.viewportWidth ||
      metrics.bodyWidth > metrics.viewportWidth
    ) {
      status = `overflow ${metrics.documentWidth}/${metrics.bodyWidth}`;
    }
    if (metrics.h1Count !== 1) status = `h1 count ${metrics.h1Count}`;
    if (metrics.skipLinkVisible) status = "skip link visible without focus";
    if (
      viewportName === "mobile" &&
      capture.name === "home-navigation-open" &&
      !metrics.navigationOpen
    ) {
      status = "mobile navigation closed";
    }
    expectedConsoleErrors = capture.expectedConsole
      ? consoleErrors.filter((message) => capture.expectedConsole.test(message))
      : [];
    unexpectedConsoleErrors = capture.expectedConsole
      ? consoleErrors.filter((message) => !capture.expectedConsole.test(message))
      : consoleErrors;
    if (
      unexpectedConsoleErrors.length ||
      pageErrors.length ||
      forbiddenRequests.length
    ) {
      status = "runtime error";
    }
    await page.screenshot({
      path: filePath,
      fullPage: true,
      style: ".skip-link:not(:focus) { display: none !important; }",
    });
  } catch (error) {
    status = error.message.split("\n")[0];
  } finally {
    await context.close();
  }

  const entry = {
    viewport: viewportName,
    viewportSize: viewport,
    group: capture.group,
    route: capture.route,
    state: capture.name,
    title,
    h1,
    status,
    file: fileName,
    metrics,
    consoleErrors,
    expectedConsoleErrors,
    unexpectedConsoleErrors,
    pageErrors,
    forbiddenRequests,
    ms: Date.now() - started,
  };
  console.log(
    `${viewportName.padEnd(8)} ${status.padEnd(18)} ${capture.name} -> ${filePath}`,
  );
  return entry;
}

function contactSheetMarkup(viewportName, entries) {
  const cards = entries
    .map(
      (entry) => `<article>
  <div class="label"><strong>${entry.state}</strong><span>${entry.status}</span></div>
  <img src="${entry.file}" alt="${entry.state}">
</article>`,
    )
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${viewportName} visual review</title>
<style>
body{margin:0;padding:24px;background:#e8edf3;color:#10233f;font:14px/1.35 Arial,sans-serif}
h1{margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
article{min-width:0;padding:10px;background:white;border:1px solid #bdc8d6;border-radius:8px;box-shadow:0 2px 8px #10233f1f}
.label{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 8px;min-width:0;margin-bottom:8px}
.label strong{min-width:0;overflow-wrap:anywhere}.label span{color:#52657c}
img{display:block;width:100%;height:240px;object-fit:cover;object-position:top;border:1px solid #d9e0e8;background:white}
</style></head><body><h1>${viewportName} visual review</h1><main class="grid">${cards}</main></body></html>`;
}

async function writeContactSheets(browser, report) {
  for (const [viewportName] of viewports) {
    const entries = report.filter((entry) => entry.viewport === viewportName);
    const htmlPath = path.join(outputDir, `contact-${viewportName}.html`);
    const pngPath = path.join(outputDir, `contact-${viewportName}.png`);
    fs.writeFileSync(htmlPath, contactSheetMarkup(viewportName, entries));
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "load" });
    await page.screenshot({ path: pngPath, fullPage: true });
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const selectedCaptures =
    captureMode === "baseline" ? baselineCaptures : captures;

  for (const [viewportName, viewport] of viewports) {
    for (const capture of selectedCaptures) {
      report.push(
        await captureState(
          browser,
          viewportName,
          viewport,
          capture,
          captureMode !== "baseline",
        ),
      );
    }
  }

  await writeContactSheets(browser, report);
  await browser.close();
  const failures = report.filter((entry) => entry.status !== "ok");
  const payload = {
    baseUrl,
    captureMode,
    generatedAt: new Date().toISOString(),
    summary: {
      states: selectedCaptures.length,
      screenshots: report.length,
      passed: report.length - failures.length,
      failed: failures.length,
    },
    report,
  };
  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify(payload, null, 2),
  );
  if (strict && failures.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  baselineCaptures,
  captures,
  cleanName,
  contactSheetMarkup,
  viewports,
  writeContactSheets,
};
