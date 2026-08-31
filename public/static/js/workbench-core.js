(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OglcnacWorkbenchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RESULT_FIELDS = [
    "protein_id", "species", "sequence_length", "position", "residue",
    "sequence_window", "probability", "confidence_band", "model_version",
    "atlas_status", "atlas_record_count", "atlas_pmids", "ogt_pin_status",
    "ogt_pin_evidence_count",
  ];

  function uniprotAccession(identifier) {
    const value = String(identifier || "").trim();
    const pipe = value.match(/^(?:sp|tr)\|([^|]+)\|/i);
    const candidate = pipe ? pipe[1] : value;
    return /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9]|A0A[A-Z0-9]{7})$/i.test(candidate)
      ? candidate.toUpperCase() : "";
  }

  function buildEvidenceIndexes(atlasRecords, ogtPinRecords) {
    const atlas = new Map();
    const ogtPin = new Map();
    (atlasRecords || []).forEach((record) => {
      const accession = String(record.accession || "").toUpperCase();
      const position = Number.parseInt(record.position_in_protein, 10);
      if (!accession || !Number.isFinite(position)) return;
      const key = `${accession}:${position}`;
      if (!atlas.has(key)) atlas.set(key, []);
      atlas.get(key).push(record);
    });
    (ogtPinRecords || []).forEach((record) => {
      const accession = String(record.uuid_b || "").toUpperCase();
      if (!accession) return;
      if (!ogtPin.has(accession)) ogtPin.set(accession, []);
      ogtPin.get(accession).push(record);
    });
    return { atlas, ogtPin };
  }

  function atlasEvidence(indexes, accession, position) {
    const records = indexes.atlas.get(`${String(accession || "").toUpperCase()}:${position}`) || [];
    const statuses = new Set(records.map((record) => String(record.ambiguous || "").toLowerCase()));
    const status = statuses.has("unambiguous") ? "unambiguous" :
      statuses.has("ambiguous") ? "ambiguous" : "not reported";
    const pmids = [...new Set(records.map((record) => String(record.pmid || "").trim()).filter(Boolean))].sort();
    return { status, recordCount: records.length, pmids };
  }

  function ogtPinEvidence(indexes, accession) {
    const records = indexes.ogtPin.get(String(accession || "").toUpperCase()) || [];
    return {
      status: records.length ? "reported interactor" : "not reported",
      evidenceCount: records.length,
    };
  }

  function enrichPredictions({ records, predictions, indexes, species, modelVersion }) {
    const recordMap = new Map((records || []).map((record) => [record.id, record]));
    return (predictions || []).map((prediction) => {
      const record = recordMap.get(prediction.id) || { sequence: "" };
      const accession = uniprotAccession(prediction.id);
      const atlas = accession ? atlasEvidence(indexes, accession, prediction.position) :
        { status: "identifier unavailable", recordCount: 0, pmids: [] };
      const ogtPin = accession ? ogtPinEvidence(indexes, accession) :
        { status: "identifier unavailable", evidenceCount: 0 };
      return {
        protein_id: prediction.id,
        species,
        sequence_length: record.sequence.length,
        position: prediction.position,
        residue: prediction.residue,
        sequence_window: prediction.window || "",
        probability: Number(prediction.score),
        confidence_band: prediction.confidence || "below threshold",
        model_version: `O-GlcNAcPRED-DL ${modelVersion} (${species})`,
        atlas_status: atlas.status,
        atlas_record_count: atlas.recordCount,
        atlas_pmids: atlas.pmids,
        ogt_pin_status: ogtPin.status,
        ogt_pin_evidence_count: ogtPin.evidenceCount,
      };
    });
  }

  function csvValue(value) {
    const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(rows) {
    return [RESULT_FIELDS.join(","), ...(rows || []).map((row) => RESULT_FIELDS.map((field) => csvValue(row[field])).join(","))].join("\n");
  }

  function toJson(rows) { return JSON.stringify(rows || [], null, 2); }

  return { RESULT_FIELDS, uniprotAccession, buildEvidenceIndexes, atlasEvidence, ogtPinEvidence, enrichPredictions, toCsv, toJson };
});
