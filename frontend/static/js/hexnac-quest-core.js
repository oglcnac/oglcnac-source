(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("papaparse"));
  } else {
    root.HexNAcQuest = factory(root.Papa);
  }
})(typeof self !== "undefined" ? self : globalThis, function (Papa) {
  "use strict";

  const OUTPUT_COLUMNS = [
    "pred_outcome",
    "id",
    "f126",
    "f138",
    "f144",
    "f168",
    "f186",
  ];

  function contractError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    if (details) Object.assign(error, details);
    return error;
  }

  function assertFileSize(size, limit = 25 * 1024 * 1024) {
    if (size > limit) {
      throw contractError(
        "file_too_large",
        `The selected CSV is larger than the ${limit / 1024 / 1024} MB limit.`,
      );
    }
  }

  function assertRowCount(count, limit = 250000) {
    if (count > limit) {
      throw contractError(
        "too_many_rows",
        `The CSV has ${count.toLocaleString()} data rows; the limit is ${limit.toLocaleString()}.`,
      );
    }
  }

  function normalizedHeaders(headerRow) {
    return headerRow.map((value, index) => {
      const text = String(value == null ? "" : value);
      return (index === 0 ? text.replace(/^\ufeff/, "") : text).trim();
    });
  }

  function validateHeaders(headers, manifest) {
    const counts = new Map();
    for (const header of headers) {
      counts.set(header, (counts.get(header) || 0) + 1);
    }
    const duplicates = [...counts]
      .filter(
        ([header, count]) =>
          count > 1 && manifest.required_columns.includes(header),
      )
      .map(([header]) => header)
      .filter(Boolean);
    if (duplicates.length) {
      throw contractError(
        "duplicate_headers",
        `Duplicate CSV header${duplicates.length === 1 ? "" : "s"}: ${duplicates.join(", ")}.`,
        { duplicates },
      );
    }
    const missing = manifest.required_columns.filter(
      (column) => !counts.has(column),
    );
    if (missing.length) {
      throw contractError(
        "missing_headers",
        `Missing required CSV header${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
        { missing },
      );
    }
  }

  function validateFeature(raw, feature) {
    if (raw == null || String(raw).trim() === "") {
      return { reason: `${feature} is missing` };
    }
    const value = Number(String(raw).trim());
    if (Number.isNaN(value)) {
      return { reason: `${feature} is not numeric` };
    }
    if (!Number.isFinite(value)) {
      return { reason: `${feature} must be finite` };
    }
    if (value < 0) {
      return { reason: `${feature} must be non-negative` };
    }
    return { value };
  }

  function validateRow(values, indexes, manifest, rowNumber) {
    const output = { rowNumber, id: String(values[indexes.id] ?? "") };
    const numeric = {};
    for (const feature of manifest.feature_columns) {
      const raw = values[indexes[feature]];
      const checked = validateFeature(raw, feature);
      if (checked.reason) return { rowNumber, reason: checked.reason };
      output[feature] = String(raw);
      numeric[feature] = checked.value;
    }
    const total = manifest.feature_columns.reduce(
      (sum, feature) => sum + numeric[feature],
      0,
    );
    if (!(total > 0)) {
      return { rowNumber, reason: "feature total must be greater than zero" };
    }
    if (
      numeric.f126 === 0 &&
      numeric.f138 === 0 &&
      numeric.f144 === 0
    ) {
      return {
        rowNumber,
        reason: "f126, f138, and f144 cannot all be zero",
      };
    }
    output.numeric = numeric;
    return output;
  }

  function parseCsv(text, manifest) {
    if (!Papa) {
      throw contractError("parser_unavailable", "The CSV parser did not load.");
    }
    const parsed = Papa.parse(text, {
      header: false,
      skipEmptyLines: "greedy",
    });
    const fatal = parsed.errors.find(
      (error) => error.code === "MissingQuotes" || error.code === "UndetectableDelimiter",
    );
    if (fatal) {
      throw contractError("invalid_csv", `CSV parsing failed: ${fatal.message}`);
    }
    if (!parsed.data.length) {
      throw contractError("empty_csv", "The selected CSV is empty.");
    }
    const headers = normalizedHeaders(parsed.data[0]);
    validateHeaders(headers, manifest);
    const rows = parsed.data.slice(1);
    assertRowCount(rows.length, manifest.limits.max_data_rows);
    const indexes = Object.fromEntries(
      manifest.required_columns.map((column) => [column, headers.indexOf(column)]),
    );
    const validRows = [];
    const invalidRows = [];
    rows.forEach((values, index) => {
      const checked = validateRow(values, indexes, manifest, index + 2);
      if (checked.reason) invalidRows.push(checked);
      else validRows.push(checked);
    });
    return {
      headers,
      totalRows: rows.length,
      validRows,
      invalidRows,
    };
  }

  function etaForFeatures(features, manifest) {
    const total = manifest.feature_columns.reduce(
      (sum, feature) => sum + Number(features[feature]),
      0,
    );
    const coefficients = manifest.coefficients;
    return (
      coefficients.intercept +
      coefficients.pf126 * (Number(features.f126) / total) +
      coefficients.pf138 * (Number(features.f138) / total) +
      coefficients.pf144 * (Number(features.f144) / total)
    );
  }

  function classifyEta(eta, manifest) {
    return eta > manifest.decision.threshold
      ? manifest.decision.positive_label
      : manifest.decision.negative_label;
  }

  function classifyFeatures(features, manifest) {
    const eta = etaForFeatures(features, manifest);
    return { eta, pred_outcome: classifyEta(eta, manifest) };
  }

  function resultForRow(row, manifest) {
    return {
      pred_outcome: classifyFeatures(row.numeric, manifest).pred_outcome,
      id: row.id,
      f126: row.f126,
      f138: row.f138,
      f144: row.f144,
      f168: row.f168,
      f186: row.f186,
    };
  }

  function exportResults(results) {
    return Papa.unparse(results, {
      columns: OUTPUT_COLUMNS,
      newline: "\r\n",
    });
  }

  function resultFilename(filename) {
    const stem = String(filename || "hexnac-quest").replace(/\.csv$/i, "");
    return `${stem}_Predicted_results.csv`;
  }

  return {
    OUTPUT_COLUMNS,
    assertFileSize,
    assertRowCount,
    classifyEta,
    classifyFeatures,
    exportResults,
    parseCsv,
    resultFilename,
    resultForRow,
    validateHeaders,
    validateRow,
  };
});
