(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OglcnacWorkbenchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RESULT_FIELDS = [
    "protein_id", "species", "sequence_length", "sequence_verification", "position", "residue",
    "sequence_window", "prediction_score", "confidence_band", "model_version",
    "atlas_status", "atlas_record_count", "atlas_pmids", "ogt_pin_status",
    "ogt_pin_evidence_count",
  ];

  function uniprotAccession(identifier) {
    const value = String(identifier || "").trim();
    const pipe = value.match(/^(?:sp|tr)\|([^|]+)\|/i);
    const candidate = pipe ? pipe[1] : value;
    return /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9]|A0A[A-Z0-9]{7})(?:-[1-9][0-9]*)?$/i.test(candidate)
      ? candidate.toUpperCase() : "";
  }

  function normalizeEvidenceSpecies(value) {
    const species = String(value || "").trim().toLowerCase();
    if (species === "human" || species.includes("homo sapiens")) return "human";
    if (species === "mouse" || species.includes("mus musculus")) return "mouse";
    return species;
  }

  function assertUniqueRecordIds(records) {
    const seen = new Set();
    (records || []).forEach((record) => {
      if (seen.has(record.id)) throw new Error(`Duplicate FASTA identifier: ${record.id}. Use a unique identifier for each record.`);
      seen.add(record.id);
    });
    return records;
  }

  function buildEvidenceIndexes(atlasRecords, ogtPinRecords) {
    const atlas = new Map();
    const ogtPin = new Map();
    (atlasRecords || []).forEach((record) => {
      const accession = String(record.accession || "").toUpperCase();
      const position = Number.parseInt(record.position_in_protein, 10);
      const residue = String(record.site_residue || "").trim().toUpperCase();
      const species = normalizeEvidenceSpecies(record.species);
      if (!accession || !Number.isFinite(position) || !residue || !species) return;
      const key = `${accession}:${position}:${residue}:${species}`;
      if (!atlas.has(key)) atlas.set(key, []);
      atlas.get(key).push(record);
    });
    (ogtPinRecords || []).forEach((record) => {
      const accession = String(record.uuid_b || "").toUpperCase();
      const species = normalizeEvidenceSpecies(record.ncbi_id_b);
      if (!accession || !species) return;
      const key = `${accession}:${species}`;
      if (!ogtPin.has(key)) ogtPin.set(key, []);
      ogtPin.get(key).push(record);
    });
    return { atlas, ogtPin };
  }

  function atlasEvidence(indexes, accession, position, residue, species) {
    const key = `${String(accession || "").toUpperCase()}:${position}:${String(residue || "").toUpperCase()}:${normalizeEvidenceSpecies(species)}`;
    const records = indexes.atlas.get(key) || [];
    const statuses = new Set(records.map((record) => String(record.ambiguous || "").toLowerCase()));
    const status = statuses.has("unambiguous") ? "unambiguous" :
      statuses.has("ambiguous") ? "ambiguous" : "not reported";
    const pmids = [...new Set(records.map((record) => String(record.pmid || "").trim()).filter(Boolean))].sort();
    return { status, recordCount: records.length, pmids };
  }

  function ogtPinEvidence(indexes, accession, species) {
    const records = indexes.ogtPin.get(`${String(accession || "").toUpperCase()}:${normalizeEvidenceSpecies(species)}`) || [];
    return {
      status: records.length ? "reported interactor" : "not reported",
      evidenceCount: records.length,
    };
  }

  function sequenceVerification(record, accession, snapshot) {
    if (!accession) return "identifier unavailable";
    const tracked = snapshot && snapshot.sequences && snapshot.sequences[accession];
    if (!tracked) return "not available in tracked snapshot";
    return String(tracked).toUpperCase() === String(record.sequence || "").toUpperCase()
      ? "verified against tracked sequence" : "mismatch with tracked sequence";
  }

  function enrichPredictions({ records, predictions, indexes, sequenceSnapshot, species, modelVersion }) {
    const recordMap = new Map((records || []).map((record) => [record.id, record]));
    return (predictions || []).map((prediction) => {
      const record = recordMap.get(prediction.id) || { sequence: "" };
      const accession = uniprotAccession(prediction.id);
      const verification = sequenceVerification(record, accession, sequenceSnapshot);
      const mismatch = verification === "mismatch with tracked sequence";
      const atlas = mismatch ? { status: "sequence mismatch", recordCount: 0, pmids: [] } : accession ? atlasEvidence(indexes, accession, prediction.position, prediction.residue, species) :
        { status: "identifier unavailable", recordCount: 0, pmids: [] };
      const ogtPin = mismatch ? { status: "sequence mismatch", evidenceCount: 0 } : accession ? ogtPinEvidence(indexes, accession, species) :
        { status: "identifier unavailable", evidenceCount: 0 };
      return {
        protein_id: prediction.id,
        species,
        sequence_length: record.sequence.length,
        sequence_verification: verification,
        position: prediction.position,
        residue: prediction.residue,
        sequence_window: prediction.window || "",
        prediction_score: Number(prediction.score),
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

  return { RESULT_FIELDS, uniprotAccession, normalizeEvidenceSpecies, assertUniqueRecordIds, buildEvidenceIndexes, atlasEvidence, ogtPinEvidence, sequenceVerification, enrichPredictions, toCsv, toJson };
});
