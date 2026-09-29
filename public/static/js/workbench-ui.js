(function () {
  "use strict";
  let worker = null;
  let jobId = "";
  let allRows = [];
  let activeRecords = [];
  let activeSpecies = "human";
  let resultPage = 0;
  let fileReadVersion = 0;
  const PAGE_SIZE = 25;

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function setMessage(id, text) { const node = byId(id); node.textContent = text; node.hidden = !text; }
  function setBusy(busy) {
    byId("workbench-form").querySelectorAll('button, select, input[type="file"]').forEach((control) => { control.disabled = busy; });
    byId("workbench-cancel").disabled = !busy;
    byId("workbench-fasta").readOnly = busy;
  }
  function stopWorker() {
    const previousWorker = worker;
    worker = null;
    if (previousWorker) previousWorker.terminate();
  }
  function download(name, type, content) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function chooseInput(upload) {
    fileReadVersion += 1;
    byId("workbench-paste-input").hidden = upload;
    byId("workbench-upload-input").hidden = !upload;
    byId("workbench-fasta").required = !upload;
    byId("workbench-file").required = upload;
    byId("workbench-paste-mode").setAttribute("aria-pressed", String(!upload));
    byId("workbench-upload-mode").setAttribute("aria-pressed", String(upload));
    if (!jobId) setBusy(false);
  }

  function renderSiteMap(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      if (!groups.has(row.protein_id)) groups.set(row.protein_id, []);
      groups.get(row.protein_id).push(row);
    });
    byId("workbench-site-map").innerHTML = [...groups].map(([id, sites]) => `<div class="site-track"><div><strong>${escapeHtml(id)}</strong><p class="site-track-meta">${escapeHtml(sites[0].species)} · ${sites[0].sequence_length} residues · ${sites.length} candidate sites<br>${escapeHtml(sites[0].sequence_verification)}</p></div><div class="site-track-line" aria-hidden="true">${sites.map((site) => `<span style="left:${Math.max(0, Math.min(100, site.position / site.sequence_length * 100))}%"></span>`).join("")}</div><small>${escapeHtml(sites[0].model_version)}</small></div>`).join("");
  }

  function siteCard(row) {
    return `<article class="workbench-site-card"><div class="workbench-site-card-head"><h3>${row.residue}${row.position}</h3><span class="workbench-score">${row.prediction_score.toFixed(3)}<small>Prediction score</small></span></div><p class="workbench-card-protein">${escapeHtml(row.protein_id)}</p><dl class="workbench-card-summary"><div><dt>Confidence</dt><dd>${escapeHtml(row.confidence_band)}</dd></div><div><dt>Atlas</dt><dd>${escapeHtml(row.atlas_status)} · ${row.atlas_record_count} record${row.atlas_record_count === 1 ? "" : "s"}</dd></div><div><dt>OGT-PIN</dt><dd>${escapeHtml(row.ogt_pin_status)} · ${row.ogt_pin_evidence_count} record${row.ogt_pin_evidence_count === 1 ? "" : "s"}</dd></div></dl><details><summary>Sequence and evidence details</summary><dl class="workbench-card-details"><div><dt>Species</dt><dd>${escapeHtml(row.species)}</dd></div><div><dt>Protein length</dt><dd>${row.sequence_length} residues</dd></div><div><dt>Sequence check</dt><dd>${escapeHtml(row.sequence_verification)}</dd></div><div><dt>Sequence window</dt><dd><code>${escapeHtml(row.sequence_window)}</code></dd></div><div><dt>Prediction model</dt><dd>${escapeHtml(row.model_version)}</dd></div><div><dt>Atlas PMIDs</dt><dd>${row.atlas_pmids.length ? escapeHtml(row.atlas_pmids.join("; ")) : "Not reported"}</dd></div></dl></details></article>`;
  }

  function renderRows() {
    const query = byId("workbench-filter").value.trim().toLowerCase();
    const filtered = allRows.filter((row) => Object.values(row).flat().join(" ").toLowerCase().includes(query));
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    resultPage = Math.min(resultPage, pageCount - 1);
    const rows = filtered.slice(resultPage * PAGE_SIZE, (resultPage + 1) * PAGE_SIZE);
    const scope = filtered.length > PAGE_SIZE ? ` Showing ${resultPage * PAGE_SIZE + 1}–${Math.min((resultPage + 1) * PAGE_SIZE, filtered.length)}.` : "";
    byId("workbench-filter-status").textContent = `${filtered.length.toLocaleString()} of ${allRows.length.toLocaleString()} rows shown. Downloads include all rows.${scope}`;
    byId("workbench-table").querySelector("tbody").innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.protein_id)}</td><td>${row.species}</td><td>${row.sequence_length}</td><td>${escapeHtml(row.sequence_verification)}</td><td>${row.residue}${row.position}</td><td><code>${escapeHtml(row.sequence_window)}</code></td><td>${row.prediction_score.toFixed(3)}</td><td>${escapeHtml(row.confidence_band)}</td><td>${escapeHtml(row.model_version)}</td><td>${escapeHtml(row.atlas_status)}</td><td>${row.atlas_record_count}</td><td>${escapeHtml(row.atlas_pmids.join("; "))}</td><td>${escapeHtml(row.ogt_pin_status)}</td><td>${row.ogt_pin_evidence_count}</td></tr>`).join("");
    byId("workbench-cards").innerHTML = rows.map(siteCard).join("");
    byId("workbench-previous").disabled = resultPage === 0;
    byId("workbench-next").disabled = resultPage >= pageCount - 1;
    byId("workbench-page").textContent = `Page ${resultPage + 1} of ${pageCount}`;
    byId("workbench-page").parentElement.hidden = pageCount === 1;
  }

  async function finish(predictions, completedJobId) {
    if (completedJobId !== jobId) return;
    const records = activeRecords;
    const species = activeSpecies;
    const accessions = [...new Set(records.map((record) => window.OglcnacWorkbenchCore.uniprotAccession(record.id)).filter(Boolean))];
    setMessage("workbench-status", "Matching curated evidence for your proteins…");
    const [atlas, ogtPin, sequenceSnapshot, manifest] = await Promise.all([
      window.OglcnacStaticData.loadAtlasRecordsForAccessions(accessions),
      accessions.length ? window.OglcnacStaticData.loadOgtPinRecords() : [],
      window.OglcnacStaticData.loadAtlasSequenceSnapshotForAccessions(accessions),
      fetch("/static/prediction/v1/manifest.json").then((response) => { if (!response.ok) throw new Error("The prediction model information could not be loaded. Try again."); return response.json(); }),
    ]);
    if (completedJobId !== jobId) return;
    allRows = window.OglcnacWorkbenchCore.enrichPredictions({ records, predictions, indexes: window.OglcnacWorkbenchCore.buildEvidenceIndexes(atlas, ogtPin), sequenceSnapshot, species, modelVersion: manifest.version });
    jobId = "";
    setBusy(false);
    setMessage("workbench-status", "");
    byId("workbench-summary").textContent = `${allRows.length.toLocaleString()} candidate S/T sites across ${records.length.toLocaleString()} protein record${records.length === 1 ? "" : "s"}.`;
    resultPage = 0;
    byId("workbench-filter").value = "";
    renderSiteMap(allRows);
    renderRows();
    byId("workbench-results").hidden = false;
    byId("workbench-results").scrollIntoView({ block: "start" });
  }

  function ensureWorker() {
    if (worker) return worker;
    const currentWorker = new Worker("/static/js/prediction-worker.js?v=20260830-workbench1");
    worker = currentWorker;
    currentWorker.addEventListener("message", (event) => {
      const message = event.data || {};
      if (worker !== currentWorker || !jobId || message.jobId !== jobId) return;
      if (message.type === "progress") {
        setMessage("workbench-status", message.phase === "predicting" ? `Predicting sites: ${message.completed}/${message.total}` : "Preparing the local predictor…");
      } else if (message.type === "result") {
        finish(message.results || [], message.jobId).catch((error) => { if (message.jobId === jobId) fail(error.message); });
      } else if (message.type === "error") {
        fail(message.message || "Analysis failed. Try submitting again.");
      }
    });
    currentWorker.addEventListener("error", (event) => {
      event.preventDefault();
      if (worker !== currentWorker) return;
      stopWorker();
      if (jobId) fail("The local prediction engine could not start. Try submitting again.");
    });
    return currentWorker;
  }

  function fail(message) {
    jobId = "";
    stopWorker();
    setBusy(false);
    setMessage("workbench-status", "");
    setMessage("workbench-error", message);
    byId("workbench-error").scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  document.addEventListener("DOMContentLoaded", () => {
    byId("workbench-paste-mode").addEventListener("click", () => chooseInput(false));
    byId("workbench-upload-mode").addEventListener("click", () => chooseInput(true));
    byId("workbench-sample").addEventListener("click", () => {
      chooseInput(false);
      byId("workbench-species").value = "human";
      byId("workbench-fasta").value = ">sp|Q96EH5|RL39L_HUMAN tracked sample\nMSSHKTFTIKRFLAKKQKQNRPIPQWIQMKPGSKIRYNSKRRHWRRTKLGL";
    });
    byId("workbench-file").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      const readVersion = ++fileReadVersion;
      byId("workbench-fasta").value = "";
      if (!file) return;
      byId("workbench-form").querySelector('button[type="submit"]').disabled = true;
      byId("workbench-file-note").textContent = "Reading FASTA file…";
      try {
        const text = await file.text();
        if (readVersion !== fileReadVersion) return;
        byId("workbench-fasta").value = text;
        byId("workbench-file-note").textContent = `${file.name} is ready. Switch to Paste FASTA to inspect or edit it.`;
      } catch (error) {
        if (readVersion === fileReadVersion) setMessage("workbench-error", "The FASTA file could not be read. Choose the file again.");
      } finally {
        if (readVersion === fileReadVersion && !jobId) setBusy(false);
      }
    });
    byId("workbench-filter").addEventListener("input", () => { resultPage = 0; renderRows(); });
    byId("workbench-table-fields").addEventListener("click", () => {
      const expanded = byId("workbench-table").classList.toggle("show-all-fields");
      byId("workbench-table-fields").setAttribute("aria-expanded", String(expanded));
      byId("workbench-table-fields").textContent = expanded ? "Show fewer fields" : "Show all fields";
    });
    byId("workbench-previous").addEventListener("click", () => { resultPage -= 1; renderRows(); });
    byId("workbench-next").addEventListener("click", () => { resultPage += 1; renderRows(); });
    byId("workbench-csv").addEventListener("click", () => download("oglcnac-workbench-results.csv", "text/csv", window.OglcnacWorkbenchCore.toCsv(allRows)));
    byId("workbench-json").addEventListener("click", () => download("oglcnac-workbench-results.json", "application/json", window.OglcnacWorkbenchCore.toJson(allRows)));
    byId("workbench-cancel").addEventListener("click", () => { if (jobId) fail("Analysis cancelled."); });
    byId("workbench-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (jobId) return;
      setMessage("workbench-error", "");
      byId("workbench-results").hidden = true;
      allRows = [];
      activeSpecies = byId("workbench-species").value;
      const fasta = byId("workbench-fasta").value;
      try {
        activeRecords = window.OglcnacPredictionCore.validateFasta(fasta, activeSpecies);
        window.OglcnacWorkbenchCore.assertUniqueRecordIds(activeRecords);
        if (!window.OglcnacPredictionCore.createCandidates(activeRecords).length) throw new Error("No S/T residues were found in the FASTA input.");
      } catch (error) { fail(error.message); return; }
      jobId = `${Date.now()}-${Math.random()}`;
      setBusy(true);
      setMessage("workbench-status", "Preparing the local predictor…");
      try { ensureWorker().postMessage({ type: "predict", jobId, species: activeSpecies, fasta }); }
      catch (error) { fail("The local prediction engine could not start. Try submitting again."); }
    });
  });
})();
