(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OglcnacOgtNetwork = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const text = (value) => String(value || "").trim();

  function speciesOptions(records) {
    return ["All species", ...new Set((records || []).map((record) => text(record.ncbi_id_b)).filter(Boolean))]
      .sort((a, b) => a === "All species" ? -1 : b === "All species" ? 1 : a.localeCompare(b));
  }

  function summarize(records, species, limit) {
    const selected = species && species !== "All species"
      ? (records || []).filter((record) => text(record.ncbi_id_b) === species)
      : (records || []);
    const proteins = new Map();
    const publications = new Set();
    selected.forEach((record) => {
      const accession = text(record.uuid_b);
      if (!accession) return;
      if (!proteins.has(accession)) proteins.set(accession, { accession, gene: text(record.gene_name_b) || accession, evidenceCount: 0 });
      proteins.get(accession).evidenceCount += 1;
      if (text(record.pmid)) publications.add(text(record.pmid));
    });
    const nodes = [...proteins.values()].sort((a, b) => b.evidenceCount - a.evidenceCount || a.gene.localeCompare(b.gene)).slice(0, limit || 12);
    return { recordCount: selected.length, proteinCount: proteins.size, publicationCount: publications.size, nodes };
  }

  function escapeHtml(value) { return text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

  function render(summary) {
    const metrics = document.querySelector("#ogt-summary-metrics");
    metrics.innerHTML = `<div><strong>${summary.recordCount.toLocaleString()}</strong><span>evidence records</span></div><div><strong>${summary.proteinCount.toLocaleString()}</strong><span>unique interactors</span></div><div><strong>${summary.publicationCount.toLocaleString()}</strong><span>supporting PMIDs</span></div>`;
    const nodeRoot = document.querySelector("#ogt-network-nodes");
    nodeRoot.innerHTML = summary.nodes.map((node, index) => {
      const angle = (Math.PI * 2 * index / Math.max(summary.nodes.length, 1)) - Math.PI / 2;
      const radius = 39;
      const left = 50 + Math.cos(angle) * radius;
      const top = 50 + Math.sin(angle) * radius;
      return `<a href="/ogt-pin/detail/?id=${encodeURIComponent(node.accession)}" style="--node-x:${left}%;--node-y:${top}%" title="${escapeHtml(node.gene)}: ${node.evidenceCount} evidence record${node.evidenceCount === 1 ? "" : "s"}"><strong>${escapeHtml(node.gene)}</strong><small>${node.evidenceCount}</small></a>`;
    }).join("");
  }

  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", async () => {
    const select = document.querySelector("#ogt-network-species");
    if (!select) return;
    try {
      const records = await window.OglcnacStaticData.loadOgtPinRecords();
      select.innerHTML = speciesOptions(records).map((species) => `<option>${escapeHtml(species)}</option>`).join("");
      const update = () => render(summarize(records, select.value, 12));
      select.addEventListener("change", update); update();
      document.querySelector("#ogt-network-status").textContent = "Current tracked OGT-PIN data loaded.";
    } catch (error) {
      document.querySelector("#ogt-network-status").textContent = "The current OGT-PIN summary could not be loaded.";
    }
  });

  return { speciesOptions, summarize };
});
