(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OglcnacRecordView = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  function text(value) { return String(value ?? "").trim(); }
  function values(records, field) {
    return [...new Set(records.map(record => text(record[field])).filter(Boolean))];
  }
  function positions(records) {
    return [...new Set(records.map(record => Number(record.position_in_protein))
      .filter(position => Number.isInteger(position) && position > 0))].sort((a, b) => a - b);
  }
  function publications(records) {
    return [...new Set(records.flatMap(record => text(record.pmid).match(/\b\d{6,9}\b/g) || []))];
  }
  function groupProteins(records) {
    const groups = new Map();
    records.forEach((record, index) => {
      const accession = text(record.accession);
      const key = accession ? JSON.stringify([accession, text(record.species).toLowerCase()]) : `unidentified:${index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    return [...groups.values()].map(records => ({
      accession: text(records[0].accession), entry_name: values(records, "entry_name").join(" / "),
      protein_name: values(records, "protein_name")[0] || "", gene_name: values(records, "gene_name").join(" / "),
      species: values(records, "species").join(" / "), positions: positions(records), recordCount: records.length,
    }));
  }
  function filterRecords(records, filters) {
    return records.filter(record => {
      if (filters.species && text(record.species).toLowerCase() !== filters.species.toLowerCase()) return false;
      // Retain mixed source annotations (e.g. "T886" or "12/13") as reported.
      // Numeric summaries and sequence highlights use positions() separately.
      const reported = !/^(?:|na|n\/a|null|none|not reported|-)$/i.test(text(record.position_in_protein));
      if (filters.position === "reported" && !reported) return false;
      if (filters.position === "unreported" && reported) return false;
      return true;
    });
  }
  function exportFields(records) { return [...new Set(records.flatMap(record => Object.keys(record)))]; }
  return { values, positions, publications, groupProteins, filterRecords, exportFields };
});
