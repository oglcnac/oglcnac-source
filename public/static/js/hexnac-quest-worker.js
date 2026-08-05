"use strict";

importScripts(
  "/static/hexnac-quest/vendor/papaparse.min.js",
  "/static/js/hexnac-quest-core.js",
);

let manifestPromise;
let validRows = [];
let activeRun = 0;

function getManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/static/hexnac-quest/v1/model.json").then(
      (response) => {
        if (!response.ok) throw new Error("The HexNAcQuest model could not be loaded.");
        return response.json();
      },
    );
  }
  return manifestPromise;
}

function serializeError(error) {
  return {
    code: error.code || "unexpected_error",
    message: error.message || "Unexpected HexNAcQuest error.",
  };
}

async function parseFile(message) {
  const manifest = await getManifest();
  HexNAcQuest.assertFileSize(
    message.buffer.byteLength,
    manifest.limits.max_file_bytes,
  );
  const text = new TextDecoder("utf-8", { fatal: false }).decode(message.buffer);
  const parsed = HexNAcQuest.parseCsv(text, manifest);
  validRows = parsed.validRows;
  activeRun += 1;
  self.postMessage({
    type: "parsed",
    totalRows: parsed.totalRows,
    validCount: validRows.length,
    invalidRows: parsed.invalidRows,
    previewRows: validRows.slice(0, 500),
  });
}

async function predictRows() {
  const manifest = await getManifest();
  const run = ++activeRun;
  const results = [];
  const counts = { GlcNAc: 0, GalNAc: 0 };
  const batchSize = 250;
  let offset = 0;

  function processBatch() {
    if (run !== activeRun) return;
    const end = Math.min(offset + batchSize, validRows.length);
    for (; offset < end; offset += 1) {
      const result = HexNAcQuest.resultForRow(validRows[offset], manifest);
      results.push(result);
      counts[result.pred_outcome] += 1;
    }
    self.postMessage({
      type: "progress",
      completed: offset,
      total: validRows.length,
    });
    if (offset < validRows.length) {
      setTimeout(processBatch, 0);
      return;
    }
    self.postMessage({ type: "complete", results, counts });
  }

  processBatch();
}

self.onmessage = async (event) => {
  try {
    if (event.data.type === "parse") await parseFile(event.data);
    if (event.data.type === "predict") await predictRows();
  } catch (error) {
    self.postMessage({ type: "error", error: serializeError(error) });
  }
};
