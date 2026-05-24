const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.SCREENSHOT_BASE_URL || "https://oglcnac.org";
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR || "visual-review";

const pages = [
  ["/", "home"],
  ["/atlas/", "atlas-home"],
  ["/atlas/statistics/", "atlas-statistics"],
  ["/atlas/search/", "atlas-search"],
  ["/atlas/browse/", "atlas-browse"],
  ["/atlas/tutorial/", "atlas-tutorial"],
  ["/atlas/download/", "atlas-download"],
  ["/atlas/contact/", "atlas-contact"],
  ["/atlas/detail/P18583", "atlas-detail"],
  ["/ogt-pin", "ogt-pin-home"],
  ["/ogt-pin/statistics", "ogt-pin-statistics"],
  ["/ogt-pin/search/", "ogt-pin-search"],
  ["/ogt-pin/tutorial/", "ogt-pin-tutorial"],
  ["/ogt-pin/contact/", "ogt-pin-contact"],
  ["/ogt-pin/detail/Q9H1M0", "ogt-pin-detail"],
  ["/pred_dl/", "pred-dl-home"],
  ["/pred_dl/input_fasta", "pred-dl-input"],
  ["/pred_dl/tutorial", "pred-dl-tutorial"],
  ["/pred_dl/download", "pred-dl-download"],
  ["/pred_dl/contact", "pred-dl-contact"],
];

const viewports = [
  ["desktop", { width: 1440, height: 1100 }],
  ["mobile", { width: 390, height: 844 }],
];

function cleanName(name) {
  return name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];

  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const [route, name] of pages) {
      const url = new URL(route, baseUrl).toString();
      const fileName = `${viewportName}-${cleanName(name)}.png`;
      const filePath = path.join(outputDir, fileName);
      const started = Date.now();
      let status = "ok";
      let title = "";

      try {
        const response = await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        title = await page.title();
        if (!response || response.status() >= 400) {
          status = `http ${response ? response.status() : "none"}`;
        }
        await page.screenshot({ path: filePath, fullPage: true });
      } catch (error) {
        status = error.message.split("\n")[0];
      }

      report.push({
        viewport: viewportName,
        route,
        title,
        status,
        file: filePath,
        ms: Date.now() - started,
      });
      console.log(`${viewportName.padEnd(8)} ${status.padEnd(10)} ${route} -> ${filePath}`);
    }

    await context.close();
  }

  await browser.close();
  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), report }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
