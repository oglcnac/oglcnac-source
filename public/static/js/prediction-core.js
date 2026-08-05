(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.OglcnacPredictionCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_INPUT_CHARS = 200000;
  const HUMAN_RESIDUES = new Set("ARNDCQEGHILKMFPSTWYVXU");
  const MOUSE_RESIDUES = new Set("ARNDCQEGHILKMFPSTWYVX");
  const ENSEMBLE_WEIGHTS = {
    human: [0.05, 0.15, 0.3, 0.2, 0.3],
    mouse: [0.2, 0.05, 0.15, 0.3, 0.3],
  };
  const WORD_INDEX_CACHE = new WeakMap();

  function predictionError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details || {});
    return error;
  }

  function parseFasta(fasta) {
    const records = [];
    let current = null;

    String(fasta || "").split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }
      if (line.startsWith(">")) {
        const id = line.slice(1).trim().split(/\s+/, 1)[0];
        current = { id, sequence: "" };
        records.push(current);
        return;
      }
      if (!current) {
        throw predictionError("invalid_fasta", "FASTA sequence must follow a header beginning with >.");
      }
      current.sequence += line.replace(/\s/g, "").toUpperCase();
    });

    return records;
  }

  function validateFasta(fasta, species) {
    if (String(fasta || "").length > MAX_INPUT_CHARS) {
      throw predictionError(
        "input_too_large",
        `FASTA input exceeds the ${MAX_INPUT_CHARS.toLocaleString("en-US")}-character limit.`,
      );
    }
    const records = parseFasta(fasta);
    if (!records.length) {
      throw predictionError("invalid_fasta", "At least one FASTA record is required.");
    }
    const allowed = species === "mouse" ? MOUSE_RESIDUES : HUMAN_RESIDUES;
    records.forEach((record) => {
      if (!record.id || !record.sequence) {
        throw predictionError("invalid_fasta", "Each FASTA record requires an identifier and sequence.");
      }
      for (let index = 0; index < record.sequence.length; index += 1) {
        const residue = record.sequence[index];
        if (!allowed.has(residue)) {
          throw predictionError(
            "unsupported_residue",
            `Unsupported residue ${residue} in ${record.id} at position ${index + 1}.`,
            { recordId: record.id, position: index + 1, residue },
          );
        }
      }
    });
    return records;
  }

  function createCandidates(records) {
    const candidates = [];
    records.forEach((record) => {
      for (let index = 0; index < record.sequence.length; index += 1) {
        const residue = record.sequence[index];
        if (residue !== "S" && residue !== "T") {
          continue;
        }
        const leftPad = "X".repeat(Math.max(0, 14 - index));
        const rightPad = "X".repeat(Math.max(0, index + 15 - record.sequence.length));
        const sequence = record.sequence.slice(
          Math.max(0, index - 14),
          Math.min(record.sequence.length, index + 15),
        );
        candidates.push({
          id: record.id,
          position: index + 1,
          residue,
          window: leftPad + sequence + rightPad,
        });
      }
    });
    return candidates;
  }

  function standardizeRows(rows) {
    if (!rows.length) {
      return [];
    }
    const columns = rows[0].length;
    const means = new Float64Array(columns);
    const variances = new Float64Array(columns);
    rows.forEach((row) => {
      for (let column = 0; column < columns; column += 1) {
        means[column] += row[column];
      }
    });
    for (let column = 0; column < columns; column += 1) {
      means[column] /= rows.length;
    }
    rows.forEach((row) => {
      for (let column = 0; column < columns; column += 1) {
        const difference = row[column] - means[column];
        variances[column] += difference * difference;
      }
    });
    for (let column = 0; column < columns; column += 1) {
      variances[column] = Math.sqrt(variances[column] / rows.length);
    }
    return rows.map((row) =>
      row.map((value, column) =>
        variances[column] === 0 ? 0 : (value - means[column]) / variances[column],
      ),
    );
  }

  function combineEnsemble(species, modelOutputs) {
    const weights = ENSEMBLE_WEIGHTS[species];
    const combined = new Float64Array(modelOutputs[0].length);
    for (let model = 0; model < weights.length; model += 1) {
      for (let index = 0; index < combined.length; index += 1) {
        combined[index] += modelOutputs[model][index] * weights[model];
      }
    }
    return combined;
  }

  function confidenceForScore(score) {
    const value = Number(score);
    if (value > 0.99) {
      return "+++";
    }
    if (value > 0.95) {
      return "++";
    }
    if (value > 0.5) {
      return "+";
    }
    return "";
  }

  function encodeAAIndexRow(window, aaindex, species) {
    const properties = aaindex.species[species].properties;
    const alphabetIndex = {};
    aaindex.alphabet.split("").forEach((residue, index) => {
      alphabetIndex[residue] = index;
    });
    const row = [];
    for (let position = 0; position < window.length; position += 1) {
      if (position === 14) {
        continue;
      }
      const residue = window[position];
      const residueIndex = alphabetIndex[residue];
      properties.forEach((property) => {
        row.push(
          residue === "X" || residue === "U"
            ? 0
            : aaindex.values[property][residueIndex],
        );
      });
    }
    return row;
  }

  function fitAAIndexScaler(candidates, aaindex, species) {
    const featureCount = 28 * aaindex.species[species].properties.length;
    const means = new Float64Array(featureCount);
    const scales = new Float64Array(featureCount);
    candidates.forEach((candidate) => {
      const row = encodeAAIndexRow(candidate.window, aaindex, species);
      for (let index = 0; index < featureCount; index += 1) {
        means[index] += row[index];
      }
    });
    for (let index = 0; index < featureCount; index += 1) {
      means[index] /= candidates.length;
    }
    candidates.forEach((candidate) => {
      const row = encodeAAIndexRow(candidate.window, aaindex, species);
      for (let index = 0; index < featureCount; index += 1) {
        const difference = row[index] - means[index];
        scales[index] += difference * difference;
      }
    });
    for (let index = 0; index < featureCount; index += 1) {
      scales[index] = Math.sqrt(scales[index] / candidates.length);
    }
    return { means, scales };
  }

  function encodeAAIndexBatch(
    candidates,
    start,
    end,
    aaindex,
    species,
    scaler,
  ) {
    const featureCount = scaler.means.length;
    const batch = new Float32Array((end - start) * featureCount);
    for (let candidateIndex = start; candidateIndex < end; candidateIndex += 1) {
      const row = encodeAAIndexRow(
        candidates[candidateIndex].window,
        aaindex,
        species,
      );
      const offset = (candidateIndex - start) * featureCount;
      for (let feature = 0; feature < featureCount; feature += 1) {
        batch[offset + feature] =
          scaler.scales[feature] === 0
            ? 0
            : (row[feature] - scaler.means[feature]) / scaler.scales[feature];
      }
    }
    return batch;
  }

  function wordIndex(metadata) {
    if (!WORD_INDEX_CACHE.has(metadata)) {
      const index = new Map();
      metadata.tokens.forEach((token, position) => index.set(token, position));
      WORD_INDEX_CACHE.set(metadata, index);
    }
    return WORD_INDEX_CACHE.get(metadata);
  }

  function encodeWord2VecBatch(candidates, start, end, metadata, vectors) {
    const dimensions = metadata.dimensions;
    const positions = 28;
    const batch = new Float32Array((end - start) * positions * dimensions);
    const index = wordIndex(metadata);
    for (let candidateIndex = start; candidateIndex < end; candidateIndex += 1) {
      const window = candidates[candidateIndex].window;
      for (let position = 0; position < positions; position += 1) {
        const token = window.slice(position, position + 2);
        const vectorIndex = index.has(token)
          ? index.get(token)
          : metadata.unknown_index;
        const sourceOffset = vectorIndex * dimensions;
        const destinationOffset =
          ((candidateIndex - start) * positions + position) * dimensions;
        batch.set(
          vectors.subarray(sourceOffset, sourceOffset + dimensions),
          destinationOffset,
        );
      }
    }
    return batch;
  }

  function formatScore(score) {
    return Number(score).toFixed(3);
  }

  return {
    MAX_INPUT_CHARS,
    parseFasta,
    validateFasta,
    createCandidates,
    standardizeRows,
    combineEnsemble,
    confidenceForScore,
    encodeAAIndexRow,
    fitAAIndexScaler,
    encodeAAIndexBatch,
    encodeWord2VecBatch,
    formatScore,
  };
});
