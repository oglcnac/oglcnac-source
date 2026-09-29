(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OglcnacProteinViewer = api;
})(typeof window === "undefined" ? globalThis : window, function (browser) {
  "use strict";

  function position(value) {
    const raw = String(value ?? "").trim();
    if (!/^\d+$/.test(raw)) return null;
    const number = Number(raw);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }
  function publications(records) {
    return [...new Set(records.flatMap(record => String(record.pmid ?? "").match(/\b\d{6,9}\b/g) || []))];
  }
  function assignments(records) {
    const counts = { unambiguous: 0, ambiguous: 0, other: 0 };
    for (const record of records) {
      const category = String(record.ambiguous ?? "").trim().toLowerCase();
      counts[category === "unambiguous" || category === "ambiguous" ? category : "other"]++;
    }
    return counts;
  }
  function sequenceFromFasta(fasta) {
    const lines = String(fasta || "").trim().split(/\r?\n/);
    if (!lines[0].startsWith(">")) return "";
    const sequence = lines.slice(1).join("").replace(/\s/g, "").toUpperCase();
    return /^[A-Z*]+$/.test(sequence) ? sequence : "";
  }
  function summarize(records, sequence = "") {
    const groups = new Map();
    let unplaced = 0;
    for (const record of records) {
      const coordinate = position(record.position_in_protein);
      if (coordinate === null) { unplaced++; continue; }
      if (!groups.has(coordinate)) groups.set(coordinate, []);
      groups.get(coordinate).push(record);
    }
    const sites = [...groups].sort((a, b) => a[0] - b[0]).map(([coordinate, rows]) => {
      const mapped = Boolean(sequence && coordinate <= sequence.length);
      const residue = mapped ? sequence[coordinate - 1] : "";
      const reportedResidues = [...new Set(rows.map(record => String(record.site_residue || "").trim()).filter(Boolean))];
      return { position: coordinate, records: rows, mapped, residue, reportedResidues,
        mismatch: mapped && reportedResidues.some(value => /^[A-Z]$/i.test(value) && value.toUpperCase() !== residue),
        publications: publications(rows), assignments: assignments(rows) };
    });
    return { sites, unplaced, sequence, records, publications: publications(records), assignments: assignments(records),
      outside: sequence ? sites.filter(site => !site.mapped).reduce((sum, site) => sum + site.records.length, 0) : 0 };
  }
  function label(site) { return site.residue && !site.mismatch ? `${site.residue}${site.position}` : `Position ${site.position}`; }
  function safeFilename(value) { return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_"); }
  function download(text, filename, type) {
    const url = browser.URL.createObjectURL(new Blob([text], { type }));
    const link = browser.document.createElement("a"); link.href = url; link.download = filename;
    browser.document.body.append(link); link.click(); link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
  }
  async function copyText(value) {
    try { await browser.navigator.clipboard.writeText(value); return true; } catch (_) {}
    const active = browser.document.activeElement;
    const field = browser.document.createElement("textarea");
    field.value = value; field.setAttribute("aria-label", "Text to copy");
    field.style.cssText = "position:fixed;top:0;left:-9999px";
    browser.document.body.append(field); field.select();
    let copied = false;
    try { copied = browser.document.execCommand("copy"); } catch (_) {}
    field.remove(); if (active && active.focus) active.focus({ preventScroll: true });
    return copied;
  }

  function create(element, options) {
    const records = options.records;
    let model = summarize(records), selected = null, view = "full", fasta = "", sequencePending = true;
    const getSite = () => model.sites.find(site => site.position === selected);
    const querySite = () => position(new browser.URL(browser.location.href).searchParams.get("site"));
    const requested = querySite();
    if (model.sites.some(site => site.position === requested)) { selected = requested; view = "region"; }
    element.innerHTML = `
      <div class="protein-viewer-toolbar">
        <div class="protein-position-controls"><label for="protein-position">Reported position</label><select id="protein-position"></select><button type="button" data-pv="previous" aria-label="Previous reported position">←</button><button type="button" data-pv="next" aria-label="Next reported position">→</button></div>
        <div class="protein-viewer-actions"><button type="button" data-pv="clear">Show all positions</button><button type="button" data-pv="share">Copy view link</button></div>
      </div>
      <p class="protein-map-instruction" data-pv="instruction">Select a position to explore its sequence and filter the peptide, evidence, and publication sections.</p>
      <div class="protein-map-workspace">
        <div class="protein-map-canvas">
          <p class="protein-map-state" data-pv="state" role="status">Loading protein sequence…</p>
          <div data-pv="drawing" hidden>
            <div class="protein-overview-caption"><span>Full protein · reported positions</span><span data-pv="length"></span></div>
            <svg class="protein-overview-map" data-pv="overview" role="img" aria-label="Reported positions along the protein. Use the reported position menu to select a site with the keyboard."></svg>
            <div class="protein-track-toolbar"><h3>Site evidence</h3><div><button type="button" data-pv="region" aria-pressed="false">Region</button><button type="button" data-pv="full" aria-pressed="true">Full protein</button></div></div>
            <svg class="protein-evidence-map" data-pv="tracks" role="img" aria-label="Positions with unambiguous and ambiguous assignments in the source records"></svg>
            <div class="protein-map-legend"><span><i class="protein-site-dot" aria-hidden="true"></i>Reported unambiguous</span><span><i class="protein-site-square" aria-hidden="true"></i>Reported ambiguous</span><span data-pv="other-legend" hidden><i class="protein-site-other" aria-hidden="true"></i>Other / not reported</span></div>
            <p class="protein-map-hover" data-pv="hover">Use the position menu or select a marker.</p>
          </div>
          <div class="protein-context-heading"><span>Sequence context</span><span data-pv="context-range"></span></div>
          <div class="protein-sequence-context" data-pv="context">Select a position to see its sequence context.</div>
        </div>
        <aside class="protein-site-detail" aria-label="Evidence summary">
          <p class="protein-site-eyebrow" data-pv="eyebrow">All reported positions</p><h3 data-pv="selected-title">Protein overview</h3>
          <p class="protein-site-counts" data-pv="counts"></p>
          <p class="protein-assignment-label">Source records by site assignment</p>
          <div class="protein-assignment-bar" aria-hidden="true"><span data-pv="unambiguous-bar"></span><span data-pv="ambiguous-bar"></span><span data-pv="other-bar"></span></div>
          <dl class="protein-assignment-counts"><div><dt>Unambiguous</dt><dd data-pv="unambiguous"></dd></div><div><dt>Ambiguous</dt><dd data-pv="ambiguous"></dd></div><div data-pv="other-row" hidden><dt>Other / not reported</dt><dd data-pv="other"></dd></div></dl>
          <p class="protein-map-note" data-pv="residue-note" hidden></p>
          <a href="#atlas-evidence" data-pv="evidence-link">View experimental evidence ↓</a>
        </aside>
      </div>
      <p class="protein-map-note" data-pv="unmapped" hidden></p>
      <p class="protein-map-note" data-pv="mapping-note" hidden></p>
      <p class="protein-selection-status" data-pv="selection-status" role="status" aria-live="polite"></p>
      <p class="protein-action-status" data-pv="action-status" role="status" aria-live="polite"></p>`;
    const el = key => element.querySelector(`[data-pv="${key}"]`);
    const select = element.querySelector("#protein-position");
    const svgNode = (tag, attributes = {}, text) => {
      const node = browser.document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      return node;
    };
    function populatePositions() {
      const all = browser.document.createElement("option"); all.value = ""; all.textContent = "All positions";
      select.replaceChildren(all);
      for (const site of model.sites) {
        const option = browser.document.createElement("option"); option.value = site.position;
        option.textContent = `${label(site)} · ${site.records.length} ${site.records.length === 1 ? "record" : "records"}`;
        select.append(option);
      }
      select.value = selected || ""; select.disabled = !model.sites.length;
    }
    function selectedRecords() { return getSite()?.records || records; }
    function notify() {
      const site = getSite();
      if (options.onSelect) options.onSelect({ position: selected, site, records: selectedRecords() });
    }
    function choose(value, updateHistory = true) {
      const coordinate = position(value);
      selected = model.sites.some(site => site.position === coordinate) ? coordinate : null;
      view = selected === null ? "full" : "region";
      if (updateHistory) {
        const url = new browser.URL(browser.location.href);
        if (selected === null) url.searchParams.delete("site"); else url.searchParams.set("site", String(selected));
        if (url.href !== browser.location.href) browser.history.pushState(null, "", url);
      }
      el("action-status").textContent = "";
      render(); notify();
    }
    function nearest(svg, event, start, end, padding, candidates) {
      const bounds = svg.getBoundingClientRect();
      const coordinate = start + (event.clientX - bounds.left - padding) / Math.max(1, bounds.width - padding * 2) * (end - start);
      return candidates.reduce((best, site) => !best || Math.abs(site.position - coordinate) < Math.abs(best.position - coordinate) ? site : best, null);
    }
    function bindMap(svg, start, end, padding, candidates) {
      svg.onclick = event => { const site = nearest(svg, event, start, end, padding, candidates); if (site) choose(site.position); };
      svg.onpointermove = event => {
        const site = nearest(svg, event, start, end, padding, candidates);
        if (site) el("hover").textContent = `${label(site)} · ${site.records.length} source records · ${site.publications.length} distinct publications`;
      };
      svg.onpointerleave = () => { el("hover").textContent = "Use the position menu or select a marker."; };
    }
    function drawOverview() {
      const svg = el("overview"), width = svg.getBoundingClientRect().width, length = model.sequence.length;
      if (!width || !length) return;
      svg.replaceChildren(); svg.setAttribute("viewBox", `0 0 ${width} 62`);
      svg.append(svgNode("title", {}, `${options.accession}: ${model.sites.filter(site => site.mapped).length} positions on a ${length}-residue sequence`));
      const x = number => 12 + (number - 1) / Math.max(1, length - 1) * (width - 24);
      const site = getSite();
      if (site?.mapped) {
        const halfSpan = Math.max(8, Math.min(36, Math.floor((width - 28) / 20)));
        const start = Math.max(1, selected - halfSpan), end = Math.min(length, selected + halfSpan);
        svg.append(svgNode("rect", { x: x(start), y: 11, width: Math.max(3, x(end) - x(start)), height: 25, class: "protein-map-highlight" }));
      }
      svg.append(svgNode("line", { x1: 12, x2: width - 12, y1: 24, y2: 24, class: "protein-map-axis" }));
      const candidates = model.sites.filter(site => site.mapped);
      for (const candidate of candidates) svg.append(svgNode("rect", { x: x(candidate.position) - 1.5, y: candidate.position === selected ? 10 : 18, width: 3, height: candidate.position === selected ? 28 : 12, class: "protein-map-site" }));
      const count = length < 4 ? length : width < 450 ? 3 : 5;
      for (let index = 0; index < count; index++) {
        const coordinate = 1 + Math.round((length - 1) * index / Math.max(1, count - 1));
        svg.append(svgNode("text", { x: x(coordinate), y: 54, "text-anchor": index === 0 ? "start" : index === count - 1 ? "end" : "middle" }, coordinate.toLocaleString()));
      }
      bindMap(svg, 1, length, 12, candidates);
    }
    function drawTracks() {
      const svg = el("tracks"), width = svg.getBoundingClientRect().width, length = model.sequence.length;
      if (!width || !length) return;
      const site = getSite(), region = view === "region" && site?.mapped;
      const halfSpan = Math.max(8, Math.min(36, Math.floor((width - 28) / 20)));
      const start = region ? Math.max(1, selected - halfSpan) : 1, end = region ? Math.min(length, selected + halfSpan) : length;
      const other = model.assignments.other > 0, height = other ? 197 : 159, axis = height - 28;
      svg.replaceChildren(); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.style.height = `${height}px`;
      svg.append(svgNode("title", {}, `Evidence positions ${start}–${end}; circles: unambiguous, squares: ambiguous${other ? ", diamonds: other or unspecified" : ""}`));
      const x = number => 14 + (number - start) / Math.max(1, end - start) * (width - 28);
      if (site?.mapped) svg.append(svgNode("rect", { x: x(selected) - 8, y: 24, width: 16, height: axis - 20, class: "protein-map-highlight" }));
      svg.append(svgNode("text", { x: width - 2, y: 14, "text-anchor": "end" }, `${start.toLocaleString()}–${end.toLocaleString()} aa`));
      for (const y of other ? [54, 90, 126] : [54, 90]) svg.append(svgNode("line", { x1: 14, x2: width - 14, y1: y, y2: y, class: "protein-map-axis" }));
      const candidates = model.sites.filter(site => site.mapped && site.position >= start && site.position <= end);
      for (const candidate of candidates) {
        const active = candidate.position === selected, coordinate = x(candidate.position);
        if (candidate.assignments.unambiguous) svg.append(svgNode("circle", { cx: coordinate, cy: 54, r: active ? 6 : 4, class: "protein-map-site" }));
        if (candidate.assignments.ambiguous) svg.append(svgNode("rect", { x: coordinate - (active ? 5 : 3.5), y: 90 - (active ? 5 : 3.5), width: active ? 10 : 7, height: active ? 10 : 7, class: "protein-map-ambiguous" }));
        if (candidate.assignments.other) svg.append(svgNode("path", { d: `M${coordinate},121l5,5l-5,5l-5,-5Z`, class: "protein-map-other" }));
      }
      if (site?.mapped) {
        const selectedLabel = svgNode("text", { x: x(selected), y: 34, "text-anchor": "middle", class: "protein-map-selected-label" }, label(site));
        svg.append(selectedLabel);
        const halfWidth = selectedLabel.getBBox().width / 2 + 2;
        selectedLabel.setAttribute("x", Math.max(halfWidth, Math.min(width - halfWidth, x(selected))));
      }
      const ticks = Math.min(end - start + 1, width < 460 ? 3 : 5);
      for (let index = 0; index < ticks; index++) {
        const coordinate = start + Math.round((end - start) * index / Math.max(1, ticks - 1));
        svg.append(svgNode("line", { x1: x(coordinate), x2: x(coordinate), y1: axis, y2: axis + 4, class: "protein-map-axis" }));
        svg.append(svgNode("text", { x: x(coordinate), y: height - 5, "text-anchor": index === 0 ? "start" : index === ticks - 1 ? "end" : "middle" }, coordinate.toLocaleString()));
      }
      bindMap(svg, start, end, 14, candidates);
    }
    function drawContext() {
      const context = el("context"), site = getSite();
      el("context-range").textContent = ""; context.replaceChildren();
      if (!site) { context.textContent = model.sites.length ? "Select a position to see its sequence context." : sequencePending ? "Loading protein sequence…" : model.sequence ? "The complete sequence is in the Protein sequence section below." : "Sequence context is unavailable for this record."; return; }
      if (!site.mapped) { context.textContent = sequencePending ? "Loading sequence context…" : model.sequence ? "This reported position is outside the available sequence." : "Sequence context is unavailable for this record."; return; }
      const flank = Math.max(3, Math.min(18, Math.floor((context.getBoundingClientRect().width - 30) / 34)));
      const start = Math.max(1, selected - flank), end = Math.min(model.sequence.length, selected + flank);
      const coordinates = new Set(model.sites.map(site => site.position));
      for (let coordinate = start; coordinate <= end; coordinate++) {
        const span = browser.document.createElement("span"); span.textContent = model.sequence[coordinate - 1];
        span.className = "protein-context-residue"; span.dataset.position = coordinate;
        if (coordinates.has(coordinate)) span.dataset.reported = "true";
        if (coordinate === selected) span.dataset.selected = "true";
        span.setAttribute("aria-label", `${span.textContent}${coordinate}${coordinate === selected ? ", selected" : ""}`);
        context.append(span);
      }
      el("context-range").textContent = `${start.toLocaleString()}–${end.toLocaleString()}`;
    }
    function render() {
      const site = getSite(), rows = selectedRecords(), counts = site ? site.assignments : model.assignments;
      el("instruction").textContent = model.sites.length ? "Select a position to explore its sequence and filter the peptide, evidence, and publication sections." : "This entry has no single numeric site annotation. Explore its source evidence below.";
      select.value = selected || "";
      const index = model.sites.findIndex(candidate => candidate.position === selected);
      el("previous").disabled = index <= 0;
      el("next").disabled = !model.sites.length || index === model.sites.length - 1;
      el("clear").disabled = selected === null;
      el("region").disabled = !site?.mapped;
      el("region").setAttribute("aria-pressed", String(view === "region" && Boolean(site?.mapped)));
      el("full").setAttribute("aria-pressed", String(view === "full" || !site?.mapped));
      el("eyebrow").textContent = site ? "Selected position" : "All reported positions";
      el("selected-title").textContent = site ? label(site) : "Protein overview";
      const publicationCount = publications(rows).length;
      el("counts").textContent = `${rows.length.toLocaleString()} ${rows.length === 1 ? "record" : "records"} · ${publicationCount} distinct ${publicationCount === 1 ? "publication" : "publications"}`;
      for (const category of ["unambiguous", "ambiguous", "other"]) {
        el(category).textContent = counts[category].toLocaleString();
        el(`${category}-bar`).style.width = `${rows.length ? counts[category] / rows.length * 100 : 0}%`;
      }
      el("other-row").hidden = !counts.other; el("other-legend").hidden = !model.assignments.other;
      el("residue-note").hidden = !site?.mismatch;
      el("residue-note").textContent = site?.mismatch ? `Sequence residue: ${site.residue}. Source records report: ${site.reportedResidues.join(", ")}. Check the original evidence before interpreting this mapping.` : "";
      const notes = [];
      if (model.unplaced) notes.push(`${model.unplaced.toLocaleString()} records have no single numeric position`);
      if (model.outside) notes.push(`${model.outside.toLocaleString()} records have a position outside this sequence`);
      el("unmapped").hidden = !notes.length;
      el("unmapped").textContent = notes.length ? `${notes.join("; ")}. These remain in the complete record and appear when all positions are shown.` : "";
      const mismatches = model.sites.filter(candidate => candidate.mismatch).length;
      el("mapping-note").hidden = !mismatches;
      el("mapping-note").textContent = mismatches ? `At ${mismatches} reported ${mismatches === 1 ? "position" : "positions"}, a source residue differs from the available sequence. These positions are labelled by number; select one to inspect the difference.` : "";
      el("state").hidden = Boolean(model.sequence && model.sites.some(site => site.mapped));
      el("state").textContent = sequencePending ? "Loading protein sequence…" : !model.sequence ? "A protein map is unavailable because this entry has no available sequence. Its source evidence remains accessible below." : !model.sites.length ? "No single numeric modification positions are reported for this entry. Its source evidence remains accessible below." : "The reported positions fall outside the available sequence. Its source evidence remains accessible below.";
      el("drawing").hidden = !el("state").hidden;
      el("length").textContent = `${model.sequence.length.toLocaleString()} aa`;
      el("selection-status").textContent = site ? `Showing ${rows.length.toLocaleString()} of ${records.length.toLocaleString()} records for ${label(site)} in the peptide, evidence, and publication sections. Complete-record downloads retain all ${records.length.toLocaleString()} records.` : `Showing all ${records.length.toLocaleString()} source records.`;
      element.dataset.state = sequencePending ? "loading" : model.sequence ? "ready" : "unavailable";
      element.dataset.position = selected || "";
      el("evidence-link").textContent = `View ${rows.length.toLocaleString()} evidence ${rows.length === 1 ? "record" : "records"} ↓`;
      if (!el("drawing").hidden) { drawOverview(); drawTracks(); }
      drawContext();
    }
    select.addEventListener("change", () => choose(select.value));
    el("clear").addEventListener("click", () => choose(null));
    el("previous").addEventListener("click", () => { const index = model.sites.findIndex(site => site.position === selected); if (index > 0) choose(model.sites[index - 1].position); });
    el("next").addEventListener("click", () => { const index = model.sites.findIndex(site => site.position === selected); if (index < model.sites.length - 1) choose(model.sites[index + 1].position); });
    for (const mode of ["region", "full"]) el(mode).addEventListener("click", () => { view = mode; render(); });
    el("share").addEventListener("click", async () => {
      const url = new browser.URL(browser.location.href);
      if (selected === null) url.searchParams.delete("site"); else url.searchParams.set("site", String(selected));
      url.hash = selected ? "atlas-landscape" : "";
      el("action-status").textContent = await copyText(url.href) ? "Link copied." : "Copy the page address from your browser to share this view.";
    });
    const onHistory = () => choose(querySite(), false);
    browser.addEventListener("popstate", onHistory);
    const resize = new browser.ResizeObserver(() => { if (!el("drawing").hidden) { drawOverview(); drawTracks(); } drawContext(); });
    resize.observe(el("context"));
    populatePositions(); render(); notify();
    if (requested && selected === null) el("action-status").textContent = `Position ${requested} is not reported in this entry. Showing all source records.`;
    return {
      setSequence(value) { fasta = value || ""; sequencePending = false; model = summarize(records, sequenceFromFasta(fasta)); populatePositions(); render(); notify(); },
      select: choose,
      getSelection() { return selected; },
      getSequence() { return model.sequence; },
      downloadFasta() { if (model.sequence) download(fasta.trim() + "\n", `${safeFilename(options.accession)}.fasta`, "text/plain;charset=utf-8"); },
      destroy() { resize.disconnect(); browser.removeEventListener("popstate", onHistory); }
    };
  }
  return { position, publications, assignments, sequenceFromFasta, summarize, create, copyText };
});
