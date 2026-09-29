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
      .querySelectorAll('.prediction-card button[type="submit"], .prediction-card input, .analysis-input-choice button')
      .forEach((button) => {
        button.disabled = busy;
      });
    document.getElementById("prediction-cancel").disabled = !busy;
    document.getElementById("message").readOnly = busy;
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
    box.scrollIntoView({ block: "nearest" });
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
    const resultsCard = document.getElementById("prediction-results-card");
    resultsCard.style.display = "block";
    resultsTable.setRows(rows, { preserveState: false });
    resultsCard.scrollIntoView({ block: "start" });
  }

  function clearPredictionResults() {
    resultsTable.setRows([], { preserveState: false });
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
      const failedWorker = worker;
      worker = null;
      if (failedWorker) failedWorker.terminate();
      finishJob();
      showPredictionError(message.message || "Prediction failed.");
    }
  }

  function predictionWorker() {
    if (!worker) {
      const currentWorker = new Worker("/static/js/prediction-worker.js");
      worker = currentWorker;
      currentWorker.addEventListener("message", (event) => {
        if (worker === currentWorker && activeJobId) handleWorkerMessage(event);
      });
      currentWorker.addEventListener("error", (event) => {
        event.preventDefault();
        if (worker !== currentWorker) return;
        worker = null;
        currentWorker.terminate();
        if (!activeJobId) return;
        finishJob();
        showPredictionError(
          "The local prediction engine could not start. Try submitting again.",
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
    try {
      predictionWorker().postMessage({
        type: "predict",
        jobId: activeJobId,
        species,
        fasta,
      });
    } catch (error) {
      if (worker) worker.terminate();
      worker = null;
      finishJob();
      showPredictionError("The local prediction engine could not start. Try submitting again.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    resultsTable = window.OglcnacTables.create("prediction-results-table", {
      filename: "oglcnac-pred-dl-results.csv",
      label: "Predicted site",
      mobileColumns: [0, 1, 2, 3, 4],
      mobileLabels: { 3: "Prediction score", 4: "Confidence" },
    });
    const textForm = document.getElementById("prediction-text-form");
    const fileForm = document.getElementById("prediction-file-form");
    const pasteMode = document.getElementById("prediction-paste-mode");
    const uploadMode = document.getElementById("prediction-upload-mode");
    function chooseInput(upload) {
      textForm.hidden = upload;
      fileForm.hidden = !upload;
      pasteMode.setAttribute("aria-pressed", String(!upload));
      uploadMode.setAttribute("aria-pressed", String(upload));
    }
    pasteMode.addEventListener("click", () => chooseInput(false));
    uploadMode.addEventListener("click", () => chooseInput(true));
    document.querySelectorAll('.prediction-card input[name="drone"]').forEach((input) => {
      input.addEventListener("change", () => {
        document.querySelectorAll(`.prediction-card input[name="drone"][value="${input.value}"]`).forEach((matching) => { matching.checked = true; });
      });
    });
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
      const species = selectedSpecies(event.currentTarget);
      if (!file) {
        showPredictionError("FASTA file is required.");
        return;
      }
      try { submitPrediction(species, await file.text()); }
      catch (error) { showPredictionError("The FASTA file could not be read. Choose the file again."); }
    });
    document.getElementById("prediction-cancel").addEventListener("click", () => {
      if (activeJobId && worker) {
        const cancelledWorker = worker;
        worker = null;
        finishJob();
        cancelledWorker.terminate();
        showPredictionError("Prediction cancelled.");
      }
    });
  });
})();
