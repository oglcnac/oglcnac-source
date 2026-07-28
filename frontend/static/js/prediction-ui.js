(function () {
  "use strict";

  const PHASE_LABELS = {
    validating: "Validating FASTA input",
    loading: "Loading predictor",
    encoding: "Encoding candidate sites",
    predicting: "Running prediction",
  };
  let worker = null;
  let activeJobId = null;
  let resultsTable = null;

  function selectedSpecies(form) {
    const selected = form.querySelector('input[name="drone"]:checked');
    return selected && selected.value === "mouse" ? "mouse" : "human";
  }

  function statusElements() {
    return {
      card: document.getElementById("prediction-status"),
      label: document.getElementById("prediction-status-label"),
      progress: document.getElementById("prediction-progress"),
    };
  }

  function setBusy(busy) {
    document
      .querySelectorAll('.prediction-card button[type="submit"]')
      .forEach((button) => {
        button.disabled = busy;
      });
    document.getElementById("prediction-cancel").disabled = !busy;
  }

  function showStatus(phase, completed, total) {
    const elements = statusElements();
    elements.card.style.display = "block";
    elements.label.textContent = PHASE_LABELS[phase] || "Preparing prediction";
    const percent = total ? Math.round((completed / total) * 100) : 0;
    elements.progress.style.width = `${percent}%`;
    elements.progress.setAttribute("aria-valuenow", String(percent));
  }

  function hideStatus() {
    statusElements().card.style.display = "none";
  }

  function showPredictionError(message) {
    const box = document.getElementById("prediction-error");
    box.textContent = message;
    box.style.display = "block";
  }

  function clearPredictionError() {
    const box = document.getElementById("prediction-error");
    box.textContent = "";
    box.style.display = "none";
  }

  function renderPredictionResults(results) {
    clearPredictionError();
    const rows = results.map((record) => [
        record.id,
        record.position,
        record.residue,
        record.score,
        record.confidence,
      ]);
    document.getElementById("prediction-results-card").style.display = "block";
    resultsTable.setRows(rows);
  }

  function clearPredictionResults() {
    resultsTable.setRows([]);
    document.getElementById("prediction-results-card").style.display = "none";
  }

  function finishJob() {
    activeJobId = null;
    setBusy(false);
    hideStatus();
  }

  function handleWorkerMessage(event) {
    const message = event.data || {};
    if (message.jobId !== activeJobId) {
      return;
    }
    if (message.type === "progress") {
      showStatus(message.phase, message.completed, message.total);
      return;
    }
    if (message.type === "result") {
      finishJob();
      renderPredictionResults(message.results || []);
      return;
    }
    if (message.type === "cancelled") {
      finishJob();
      showPredictionError("Prediction cancelled.");
      return;
    }
    if (message.type === "error") {
      finishJob();
      showPredictionError(message.message || "Prediction failed.");
    }
  }

  function predictionWorker() {
    if (!worker) {
      worker = new Worker("/static/js/prediction-worker.js");
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", () => {
        finishJob();
        showPredictionError(
          "The local prediction engine could not start. Please reload and try again.",
        );
      });
    }
    return worker;
  }

  function submitPrediction(species, fasta) {
    clearPredictionError();
    clearPredictionResults();
    let candidates;
    try {
      const records = window.OglcnacPredictionCore.validateFasta(fasta, species);
      candidates = window.OglcnacPredictionCore.createCandidates(records);
      if (!candidates.length) {
        showPredictionError("No S/T residues were found in the FASTA input.");
        return;
      }
    } catch (error) {
      showPredictionError(error.message);
      return;
    }
    if (
      candidates.length > 2000 &&
      !window.confirm(
        `This input contains ${candidates.length.toLocaleString()} candidate S/T sites and may take several minutes. Continue?`,
      )
    ) {
      return;
    }
    activeJobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setBusy(true);
    showStatus("validating", 0, 1);
    predictionWorker().postMessage({
      type: "predict",
      jobId: activeJobId,
      species,
      fasta,
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    resultsTable = window.OglcnacTables.create("prediction-results-table", {
      filename: "oglcnac-pred-dl-results.csv",
    });
    const textForm = document.getElementById("prediction-text-form");
    const fileForm = document.getElementById("prediction-file-form");
    textForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitPrediction(
        selectedSpecies(event.currentTarget),
        event.currentTarget.short_fasta.value,
      );
    });
    fileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = event.currentTarget.querySelector('input[type="file"]').files[0];
      if (!file) {
        showPredictionError("FASTA file is required.");
        return;
      }
      submitPrediction(
        selectedSpecies(event.currentTarget),
        await file.text(),
      );
    });
    document.getElementById("prediction-cancel").addEventListener("click", () => {
      if (activeJobId && worker) {
        worker.terminate();
        worker = null;
        finishJob();
        showPredictionError("Prediction cancelled.");
      }
    });
  });
})();
