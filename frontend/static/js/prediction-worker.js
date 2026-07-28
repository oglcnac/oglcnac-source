importScripts(
  "/static/prediction/vendor/tfjs-2.8.5/tf.min.js",
  "/static/prediction/vendor/tfjs-2.8.5/tf-backend-wasm.min.js",
  "/static/js/prediction-core.js",
);

const ASSET_ROOT = "/static/prediction/v1/";
const WASM_ROOT = "/static/prediction/vendor/tfjs-2.8.5/";
const loadedSpecies = new Map();
const cancelledJobs = new Set();
let sharedAssetsPromise = null;
let runtimePromise = null;

function progress(jobId, phase, completed, total) {
  self.postMessage({ type: "progress", jobId, phase, completed, total });
}

function checkCancelled(jobId) {
  if (cancelledJobs.has(jobId)) {
    const error = new Error("Prediction cancelled.");
    error.code = "cancelled";
    throw error;
  }
}

function yieldToWorker() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fitAAIndexScaler(candidates, aaindex, species, jobId) {
  const featureCount = 28 * aaindex.species[species].properties.length;
  const means = new Float64Array(featureCount);
  const scales = new Float64Array(featureCount);
  const chunkSize = 128;
  const totalWork = candidates.length * 2;

  for (let start = 0; start < candidates.length; start += chunkSize) {
    const end = Math.min(candidates.length, start + chunkSize);
    for (let candidate = start; candidate < end; candidate += 1) {
      const row = self.OglcnacPredictionCore.encodeAAIndexRow(
        candidates[candidate].window,
        aaindex,
        species,
      );
      for (let feature = 0; feature < featureCount; feature += 1) {
        means[feature] += row[feature];
      }
    }
    progress(jobId, "encoding", end, totalWork);
    await yieldToWorker();
    checkCancelled(jobId);
  }
  for (let feature = 0; feature < featureCount; feature += 1) {
    means[feature] /= candidates.length;
  }

  for (let start = 0; start < candidates.length; start += chunkSize) {
    const end = Math.min(candidates.length, start + chunkSize);
    for (let candidate = start; candidate < end; candidate += 1) {
      const row = self.OglcnacPredictionCore.encodeAAIndexRow(
        candidates[candidate].window,
        aaindex,
        species,
      );
      for (let feature = 0; feature < featureCount; feature += 1) {
        const difference = row[feature] - means[feature];
        scales[feature] += difference * difference;
      }
    }
    progress(jobId, "encoding", candidates.length + end, totalWork);
    await yieldToWorker();
    checkCancelled(jobId);
  }
  for (let feature = 0; feature < featureCount; feature += 1) {
    scales[feature] = Math.sqrt(scales[feature] / candidates.length);
  }
  return { means, scales };
}

async function initializeRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      tf.wasm.setWasmPaths(WASM_ROOT);
      await tf.setBackend("wasm");
      await tf.ready();
    })();
  }
  return runtimePromise;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}`);
  }
  return response.json();
}

async function loadSharedAssets() {
  if (!sharedAssetsPromise) {
    sharedAssetsPromise = Promise.all([
      fetchJson(`${ASSET_ROOT}manifest.json`),
      fetchJson(`${ASSET_ROOT}aaindex.json`),
    ]).then(([manifest, aaindex]) => ({ manifest, aaindex }));
  }
  return sharedAssetsPromise;
}

async function loadSpecies(species, jobId) {
  if (loadedSpecies.has(species)) {
    return loadedSpecies.get(species);
  }
  const loading = (async () => {
    progress(jobId, "loading", 0, 1);
    await initializeRuntime();
    const { manifest, aaindex } = await loadSharedAssets();
    const config = manifest.species[species];
    const [word2vec, vectorResponse, models] = await Promise.all([
      fetchJson(`${ASSET_ROOT}${config.word2vec.metadata}`),
      fetch(`${ASSET_ROOT}${config.word2vec.vectors}`),
      Promise.all(
        config.models.map(async (modelConfig) => ({
          config: modelConfig,
          model: await tf.loadLayersModel(`${ASSET_ROOT}${modelConfig.model}`),
        })),
      ),
    ]);
    if (!vectorResponse.ok) {
      throw new Error(`Unable to load ${config.word2vec.vectors}`);
    }
    const vectors = new Float32Array(await vectorResponse.arrayBuffer());
    progress(jobId, "loading", 1, 1);
    return { manifest, aaindex, word2vec, vectors, models };
  })();
  loadedSpecies.set(species, loading);
  try {
    return await loading;
  } catch (error) {
    loadedSpecies.delete(species);
    throw error;
  }
}

async function runPrediction(message) {
  const { jobId, species, fasta } = message;
  progress(jobId, "validating", 0, 1);
  const records = self.OglcnacPredictionCore.validateFasta(fasta, species);
  const candidates = self.OglcnacPredictionCore.createCandidates(records);
  if (!candidates.length) {
    const error = new Error("No S/T residues were found in the FASTA input.");
    error.code = "no_sites";
    throw error;
  }
  progress(jobId, "validating", 1, 1);
  checkCancelled(jobId);

  const assets = await loadSpecies(species, jobId);
  checkCancelled(jobId);
  progress(jobId, "encoding", 0, candidates.length * 2);
  const scaler = await fitAAIndexScaler(
    candidates,
    assets.aaindex,
    species,
    jobId,
  );

  const results = [];
  const batchSize = assets.manifest.batch_size;
  for (let start = 0; start < candidates.length; start += batchSize) {
    checkCancelled(jobId);
    const end = Math.min(candidates.length, start + batchSize);
    const count = end - start;
    const aaindexValues = self.OglcnacPredictionCore.encodeAAIndexBatch(
      candidates,
      start,
      end,
      assets.aaindex,
      species,
      scaler,
    );
    const word2vecValues = self.OglcnacPredictionCore.encodeWord2VecBatch(
      candidates,
      start,
      end,
      assets.word2vec,
      assets.vectors,
    );
    const aaindexTensor = tf.tensor3d(aaindexValues, [count, 28, 29]);
    const word2vecTensor = tf.tensor3d(word2vecValues, [count, 28, 30]);
    const combined = new Float64Array(count);
    try {
      for (const loaded of assets.models) {
        const input =
          loaded.config.input_source === "aaindex"
            ? aaindexTensor
            : word2vecTensor;
        const output = loaded.model.predict(input);
        const values = await output.data();
        output.dispose();
        for (let index = 0; index < count; index += 1) {
          combined[index] += values[index] * loaded.config.ensemble_weight;
        }
      }
    } finally {
      aaindexTensor.dispose();
      word2vecTensor.dispose();
    }
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates[start + index];
      const score = self.OglcnacPredictionCore.formatScore(combined[index]);
      results.push({
        id: candidate.id,
        position: candidate.position,
        residue: candidate.residue,
        score,
        confidence: self.OglcnacPredictionCore.confidenceForScore(score),
      });
    }
    progress(jobId, "predicting", end, candidates.length);
  }
  return results;
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "cancel") {
    cancelledJobs.add(message.jobId);
    return;
  }
  if (message.type !== "predict") {
    return;
  }
  try {
    const results = await runPrediction(message);
    self.postMessage({ type: "result", jobId: message.jobId, results });
  } catch (error) {
    if (error.code === "cancelled") {
      self.postMessage({ type: "cancelled", jobId: message.jobId });
    } else {
      self.postMessage({
        type: "error",
        jobId: message.jobId,
        code: error.code || "prediction_failed",
        message: error.message || "Prediction failed.",
      });
    }
  } finally {
    cancelledJobs.delete(message.jobId);
  }
});
