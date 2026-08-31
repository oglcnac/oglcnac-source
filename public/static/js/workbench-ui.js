(function () {
  "use strict";
  let worker = null;
  let jobId = "";
  let allRows = [];
  let activeRecords = [];
  let activeSpecies = "human";

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function setMessage(id, text) { const node = byId(id); node.textContent = text; node.hidden = !text; }
  function setBusy(busy) { byId("workbench-form").querySelector('button[type="submit"]').disabled = busy; byId("workbench-cancel").disabled = !busy; }
  function download(name, type, content) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); }

  function renderSiteMap(rows) {
    const groups = new Map();
    rows.forEach((row) => { if (!groups.has(row.protein_id)) groups.set(row.protein_id, []); groups.get(row.protein_id).push(row); });
    byId("workbench-site-map").innerHTML = [...groups].map(([id, sites]) => `<div class="site-track"><strong>${escapeHtml(id)}</strong><div class="site-track-line">${sites.map((site) => `<span style="left:${Math.max(0, Math.min(100, site.position / site.sequence_length * 100))}%" title="${site.residue}${site.position}: ${site.prediction_score.toFixed(3)}"></span>`).join("")}</div><small>${sites.length} S/T candidates across ${sites[0].sequence_length} residues</small></div>`).join("");
  }

  function renderRows() {
    const query = byId("workbench-filter").value.trim().toLowerCase();
    const rows = allRows.filter((row) => Object.values(row).flat().join(" ").toLowerCase().includes(query));
    byId("workbench-filter-status").textContent = `${rows.length.toLocaleString()} of ${allRows.length.toLocaleString()} rows shown. Downloads include all rows.`;
    byId("workbench-table").querySelector("tbody").innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.protein_id)}</td><td>${row.species}</td><td>${row.sequence_length}</td><td>${escapeHtml(row.sequence_verification)}</td><td>${row.residue}${row.position}</td><td><code>${escapeHtml(row.sequence_window)}</code></td><td>${row.prediction_score.toFixed(3)}</td><td>${escapeHtml(row.confidence_band)}</td><td>${escapeHtml(row.model_version)}</td><td>${escapeHtml(row.atlas_status)}</td><td>${row.atlas_record_count}</td><td>${escapeHtml(row.atlas_pmids.join("; "))}</td><td>${escapeHtml(row.ogt_pin_status)}</td><td>${row.ogt_pin_evidence_count}</td></tr>`).join("");
  }

  async function finish(predictions, completedJobId) {
    const [atlas, ogtPin, sequenceSnapshot, manifest] = await Promise.all([window.OglcnacStaticData.loadAtlasRecords(), window.OglcnacStaticData.loadOgtPinRecords(), window.OglcnacStaticData.loadAtlasSequenceSnapshot(), fetch("/static/prediction/v1/manifest.json").then((response) => response.json())]);
    if (completedJobId !== jobId) return;
    allRows = window.OglcnacWorkbenchCore.enrichPredictions({ records: activeRecords, predictions, indexes: window.OglcnacWorkbenchCore.buildEvidenceIndexes(atlas, ogtPin), sequenceSnapshot, species: activeSpecies, modelVersion: manifest.version });
    setBusy(false); setMessage("workbench-status", "");
    byId("workbench-summary").textContent = `${allRows.length.toLocaleString()} candidate S/T sites across ${activeRecords.length.toLocaleString()} protein record${activeRecords.length === 1 ? "" : "s"}.`;
    renderSiteMap(allRows); renderRows(); byId("workbench-results").hidden = false; byId("workbench-results").scrollIntoView({ block: "start" });
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker("/static/js/prediction-worker.js?v=20260830-workbench1");
    worker.addEventListener("message", (event) => {
      const message = event.data || {}; if (message.jobId !== jobId) return;
      if (message.type === "progress") { setMessage("workbench-status", message.phase === "predicting" ? `Predicting sites: ${message.completed}/${message.total}` : "Preparing the local predictor…"); return; }
      if (message.type === "result") finish(message.results || [], message.jobId).catch((error) => { if (message.jobId === jobId) fail(error.message); });
      if (message.type === "error") fail(message.message || "Analysis failed.");
    });
    worker.addEventListener("error", () => fail("The local prediction engine could not start."));
    return worker;
  }

  function fail(message) { jobId = ""; setBusy(false); setMessage("workbench-status", ""); setMessage("workbench-error", message); }

  document.addEventListener("DOMContentLoaded", () => {
    byId("workbench-sample").addEventListener("click", () => { byId("workbench-species").value = "human"; byId("workbench-fasta").value = ">sp|Q96EH5|RL39L_HUMAN tracked sample\nMSSHKTFTIKRFLAKKQKQNRPIPQWIQMKPGSKIRYNSKRRHWRRTKLGL"; });
    byId("workbench-file").addEventListener("change", async (event) => { const file = event.target.files[0]; if (file) byId("workbench-fasta").value = await file.text(); });
    byId("workbench-filter").addEventListener("input", renderRows);
    byId("workbench-csv").addEventListener("click", () => download("oglcnac-workbench-results.csv", "text/csv", window.OglcnacWorkbenchCore.toCsv(allRows)));
    byId("workbench-json").addEventListener("click", () => download("oglcnac-workbench-results.json", "application/json", window.OglcnacWorkbenchCore.toJson(allRows)));
    byId("workbench-cancel").addEventListener("click", () => { if (worker) worker.terminate(); worker = null; fail("Analysis cancelled."); });
    byId("workbench-form").addEventListener("submit", (event) => {
      event.preventDefault(); setMessage("workbench-error", ""); byId("workbench-results").hidden = true;
      activeSpecies = byId("workbench-species").value; const fasta = byId("workbench-fasta").value;
      try { activeRecords = window.OglcnacPredictionCore.validateFasta(fasta, activeSpecies); window.OglcnacWorkbenchCore.assertUniqueRecordIds(activeRecords); if (!window.OglcnacPredictionCore.createCandidates(activeRecords).length) throw new Error("No S/T residues were found in the FASTA input."); } catch (error) { fail(error.message); return; }
      jobId = `${Date.now()}-${Math.random()}`; setBusy(true); setMessage("workbench-status", "Preparing the local predictor…"); ensureWorker().postMessage({ type: "predict", jobId, species: activeSpecies, fasta });
    });
  });
})();
