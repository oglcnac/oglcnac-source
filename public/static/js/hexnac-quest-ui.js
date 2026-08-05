(function () {
  "use strict";

  const PAGE_SIZE = 20;
  const featureNames = ["f126", "f138", "f144", "f168", "f186"];
  const colors = ["#b42335", "#2454a6", "#0f766e", "#c88a12", "#6741a5"];
  const elements = {
    file: document.querySelector("#hexnac-file"),
    run: document.querySelector("#hexnac-run"),
    cancel: document.querySelector("#hexnac-cancel"),
    download: document.querySelector("#hexnac-download"),
    status: document.querySelector("#hexnac-status"),
    progress: document.querySelector("#hexnac-progress"),
    progressText: document.querySelector("#hexnac-progress-text"),
    previewBody: document.querySelector("#hexnac-preview-body"),
    skippedBody: document.querySelector("#hexnac-skipped-body"),
    resultsBody: document.querySelector("#hexnac-results-body"),
    previewPager: document.querySelector("#hexnac-preview-pager"),
    skippedPager: document.querySelector("#hexnac-skipped-pager"),
    resultsPager: document.querySelector("#hexnac-results-pager"),
    spectrum: document.querySelector("#hexnac-spectrum"),
    previewCard: document.querySelector("#hexnac-preview-card"),
    skippedCard: document.querySelector("#hexnac-skipped-card"),
    resultsCard: document.querySelector("#hexnac-results-card"),
  };

  if (!elements.file) return;

  let worker;
  let originalFilename = "";
  let previewRows = [];
  let invalidRows = [];
  let results = [];
  let selectionToken = 0;

  function setStatus(state, message) {
    elements.status.dataset.state = state;
    elements.status.textContent = message;
  }

  function resetOutput() {
    previewRows = [];
    invalidRows = [];
    results = [];
    elements.previewBody.replaceChildren();
    elements.skippedBody.replaceChildren();
    elements.resultsBody.replaceChildren();
    elements.spectrum.replaceChildren();
    elements.previewCard.hidden = true;
    elements.skippedCard.hidden = true;
    elements.resultsCard.hidden = true;
    elements.download.disabled = true;
    elements.progress.value = 0;
    elements.progressText.textContent = "";
    for (const item of document.querySelectorAll("[data-summary]")) {
      item.textContent = "0";
    }
  }

  function makeCell(value) {
    const cell = document.createElement("td");
    cell.textContent = String(value);
    return cell;
  }

  function renderPager(rows, body, pager, renderRow, page = 0) {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), pages - 1);
    body.replaceChildren();
    rows
      .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
      .forEach((row, index) => body.append(renderRow(row, safePage * PAGE_SIZE + index)));
    pager.replaceChildren();
    if (rows.length <= PAGE_SIZE) return;
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = safePage === 0;
    previous.addEventListener("click", () =>
      renderPager(rows, body, pager, renderRow, safePage - 1),
    );
    const label = document.createElement("span");
    label.textContent = `Page ${safePage + 1} of ${pages}`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = safePage === pages - 1;
    next.addEventListener("click", () =>
      renderPager(rows, body, pager, renderRow, safePage + 1),
    );
    pager.append(previous, label, next);
  }

  function drawSpectrum(row) {
    const namespace = "http://www.w3.org/2000/svg";
    const width = 560;
    const height = 250;
    const values = featureNames.map((name) => Number(row.numeric[name]));
    const maximum = Math.max(...values, 1);
    elements.spectrum.replaceChildren();
    elements.spectrum.setAttribute(
      "aria-label",
      `Oxonium-ion intensities for ${row.id || "the selected row"}`,
    );
    values.forEach((value, index) => {
      const barHeight = (value / maximum) * 160;
      const x = 44 + index * 102;
      const rect = document.createElementNS(namespace, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", 190 - barHeight);
      rect.setAttribute("width", 54);
      rect.setAttribute("height", barHeight);
      rect.setAttribute("fill", colors[index]);
      const title = document.createElementNS(namespace, "title");
      title.textContent = `${featureNames[index]}: ${row[featureNames[index]]}`;
      rect.append(title);
      const label = document.createElementNS(namespace, "text");
      label.setAttribute("x", x + 27);
      label.setAttribute("y", 218);
      label.setAttribute("text-anchor", "middle");
      label.textContent = featureNames[index].slice(1);
      elements.spectrum.append(rect, label);
    });
    elements.spectrum.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  function previewRow(row, absoluteIndex) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.setAttribute("aria-label", `Select data row ${row.rowNumber}`);
    [row.id, ...featureNames.map((name) => row[name])].forEach((value) =>
      tr.append(makeCell(value)),
    );
    const select = () => {
      document
        .querySelectorAll("#hexnac-preview-body tr")
        .forEach((candidate) => candidate.classList.remove("selected"));
      tr.classList.add("selected");
      drawSpectrum(row);
    };
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") select();
    });
    if (absoluteIndex === 0) {
      tr.classList.add("selected");
      drawSpectrum(row);
    }
    return tr;
  }

  function skippedRow(row) {
    const tr = document.createElement("tr");
    tr.append(makeCell(row.rowNumber), makeCell(row.reason));
    return tr;
  }

  function resultRow(row) {
    const tr = document.createElement("tr");
    [row.pred_outcome, row.id, ...featureNames.map((name) => row[name])].forEach(
      (value) => tr.append(makeCell(value)),
    );
    return tr;
  }

  function createWorker() {
    if (worker) worker.terminate();
    const nextWorker = new Worker("/static/js/hexnac-quest-worker.js");
    worker = nextWorker;
    nextWorker.onmessage = (event) => {
      if (worker === nextWorker) handleWorkerMessage(event);
    };
    nextWorker.onerror = () => {
      if (worker !== nextWorker) return;
      setStatus("error", "HexNAcQuest could not start the analysis. Reload the page and try again.");
      elements.run.disabled = true;
      elements.cancel.disabled = true;
    };
    return nextWorker;
  }

  function handleWorkerMessage(event) {
    const message = event.data;
    if (message.type === "parsed") {
      previewRows = message.previewRows;
      invalidRows = message.invalidRows;
      elements.previewCard.hidden = previewRows.length === 0;
      elements.skippedCard.hidden = invalidRows.length === 0;
      renderPager(
        previewRows,
        elements.previewBody,
        elements.previewPager,
        previewRow,
      );
      renderPager(
        invalidRows,
        elements.skippedBody,
        elements.skippedPager,
        skippedRow,
      );
      if (!message.validCount) {
        setStatus(
          "error",
          `No valid data rows were found. ${message.invalidRows.length} row(s) were skipped.`,
        );
        elements.run.disabled = true;
        return;
      }
      setStatus(
        "ready",
        `${message.validCount.toLocaleString()} valid row(s) ready; ${message.invalidRows.length.toLocaleString()} skipped.`,
      );
      elements.run.disabled = false;
      elements.cancel.disabled = true;
      return;
    }
    if (message.type === "progress") {
      elements.progress.max = message.total || 1;
      elements.progress.value = message.completed;
      elements.progressText.textContent = `Predicting ${message.completed.toLocaleString()} of ${message.total.toLocaleString()} rows`;
      return;
    }
    if (message.type === "complete") {
      results = message.results;
      renderPager(
        results,
        elements.resultsBody,
        elements.resultsPager,
        resultRow,
      );
      elements.resultsCard.hidden = false;
      document.querySelector('[data-summary="total"]').textContent =
        String(results.length);
      document.querySelector('[data-summary="skipped"]').textContent =
        String(invalidRows.length);
      document.querySelector('[data-summary="glcnac"]').textContent =
        String(message.counts.GlcNAc);
      document.querySelector('[data-summary="galnac"]').textContent =
        String(message.counts.GalNAc);
      setStatus("complete", `Prediction complete for ${results.length.toLocaleString()} row(s).`);
      elements.run.disabled = false;
      elements.cancel.disabled = true;
      elements.download.disabled = false;
      elements.progressText.textContent = "Prediction complete";
      return;
    }
    if (message.type === "error") {
      setStatus("error", message.error.message);
      elements.run.disabled = true;
      elements.cancel.disabled = true;
    }
  }

  elements.file.addEventListener("change", async () => {
    const token = ++selectionToken;
    if (worker) worker.terminate();
    worker = null;
    resetOutput();
    const file = elements.file.files[0];
    elements.run.disabled = true;
    elements.cancel.disabled = true;
    if (!file) {
      setStatus("idle", "Choose a CSV file to begin.");
      return;
    }
    originalFilename = file.name;
    if (file.size > 25 * 1024 * 1024) {
      setStatus("error", "The selected CSV is larger than the 25 MB limit.");
      return;
    }
    setStatus("parsing", "Reading and validating the selected CSV…");
    const selectionWorker = createWorker();
    const buffer = await file.arrayBuffer();
    if (token !== selectionToken || worker !== selectionWorker) return;
    selectionWorker.postMessage({ type: "parse", buffer }, [buffer]);
  });

  elements.run.addEventListener("click", () => {
    results = [];
    elements.resultsBody.replaceChildren();
    elements.resultsCard.hidden = true;
    elements.run.disabled = true;
    elements.cancel.disabled = false;
    elements.download.disabled = true;
    setStatus("predicting", "Classifying spectra with HexNAcQuest…");
    worker.postMessage({ type: "predict" });
  });

  elements.cancel.addEventListener("click", () => {
    selectionToken += 1;
    if (worker) worker.terminate();
    worker = null;
    results = [];
    elements.resultsBody.replaceChildren();
    elements.resultsCard.hidden = true;
    elements.run.disabled = true;
    elements.cancel.disabled = true;
    elements.download.disabled = true;
    elements.progress.value = 0;
    elements.progressText.textContent = "";
    elements.file.value = "";
    setStatus(
      "cancelled",
      "Prediction cancelled. Select the CSV again to restart.",
    );
  });

  elements.download.addEventListener("click", () => {
    const csv = HexNAcQuest.exportResults(results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = HexNAcQuest.resultFilename(originalFilename);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  setStatus("idle", "Choose a CSV file to begin.");
})();
