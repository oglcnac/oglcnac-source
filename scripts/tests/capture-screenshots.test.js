"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  baselineCaptures,
  captures,
  previewCaptures,
  selectCaptures,
  contactSheetMarkup,
  viewports,
} = require("../capture_screenshots.js");

const root = path.resolve(__dirname, "../..");

test("visual audit covers every public configured route and required dynamic state", () => {
  const site = JSON.parse(
    fs.readFileSync(path.join(root, "site/site.json"), "utf8"),
  );
  const configured = new Set(site.pages.filter((page) => page.section !== "research" && page.visibility !== "preview" && !page.route.startsWith("/research/")).map((page) => page.route));
  const capturedRoutes = new Set(captures.map((capture) => capture.route));
  const capturedPaths = new Set(
    captures.map((capture) => new URL(capture.route, "https://example.test").pathname),
  );

  for (const route of configured) {
    if (route === "/404/") {
      assert.ok(capturedRoutes.has("/404.html"));
    } else {
      assert.ok(capturedPaths.has(route), `missing visual route ${route}`);
    }
  }

  const requiredStates = [
    "atlas-search-results",
    "atlas-search-empty",
    "atlas-search-error",
    "atlas-detail",
    "atlas-detail-empty",
    "ogt-pin-search-results",
    "ogt-pin-search-empty",
    "ogt-pin-search-error",
    "ogt-pin-detail",
    "ogt-pin-detail-empty",
    "ogt-pin-publication-figures",
    "pred-dl-result",
    "pred-dl-error",
    "workbench",
    "workbench-result",
    "workbench-error",
    "hexnac-analysis",
    "hexnac-result",
    "hexnac-error",
    "home-navigation-open",
    "not-found",
  ];
  const names = captures.map((capture) => capture.name);
  assert.equal(new Set(names).size, names.length, "capture names must be unique");
  for (const state of requiredStates) assert.ok(names.includes(state), state);
});

test("research visual capture is an explicit preview opt-in", () => {
  for (const mode of ["audit", "baseline"]) {
    assert.ok(selectCaptures(mode).every((capture) => !capture.route.startsWith("/research/")));
    const selected = selectCaptures(mode, true);
    for (const preview of previewCaptures) assert.ok(selected.includes(preview));
    assert.equal(new Set(selected.map((capture) => capture.name)).size, selected.length);
  }
  assert.ok(previewCaptures.some((capture) => capture.route === "/research/functional/"));
});

test("visual audit locks 4K, wide, desktop, and mobile viewports and contact sheets", () => {
  assert.deepEqual(viewports, [
    ["4k", { width: 3840, height: 2160 }],
    ["wide", { width: 1920, height: 1080 }],
    ["desktop", { width: 1440, height: 1100 }],
    ["mobile", { width: 390, height: 844 }],
  ]);
  const markup = contactSheetMarkup("desktop", [
    { state: "home", status: "ok", file: "desktop-home.png" },
  ]);
  assert.match(markup, /desktop visual review/);
  assert.match(markup, /desktop-home\.png/);
});

test("baseline mode keeps one selector-agnostic comparison for every tool", () => {
  assert.deepEqual(
    new Set(baselineCaptures.map((capture) => capture.group)),
    new Set(["suite", "atlas", "ogt-pin", "pred-dl", "hexnac", "workbench"]),
  );
  assert.ok(baselineCaptures.some((capture) => capture.name === "not-found"));
  assert.ok(
    baselineCaptures.every(
      (capture) =>
        !/(?:navigation-open|results|empty|error|result)$/.test(capture.name),
    ),
  );
});
