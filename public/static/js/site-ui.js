(function () {
  "use strict";
  const search = document.getElementById("site-search");
  const form = document.getElementById("site-search-form");
  const resource = document.getElementById("site-search-resource");
  const field = document.getElementById("site-search-field");
  const term = document.getElementById("site-search-term");
  const sourceFields = {
    atlas: [["accession", "Accession"], ["gene_name", "Gene name"], ["protein_name", "Protein name"], ["peptide_seq", "Peptide sequence"], ["species", "Species"]],
    "ogt-pin": [["uuid_b", "Interactor accession"], ["gene_name_b", "Interactor gene"], ["protein_name_b", "Interactor protein"], ["species", "Species / taxonomy ID"]]
  };
  let previousFocus;
  function updateSearch() {
    const selected = resource.value;
    field.replaceChildren(...sourceFields[selected].map(([value, label]) => new Option(label, value)));
    form.action = selected === "atlas" ? "/atlas/search/" : "/ogt-pin/search/";
    term.placeholder = selected === "atlas" ? "e.g. P18583" : "e.g. Q9H1M0";
  }
  resource.addEventListener("change", updateSearch);
  if (location.pathname.startsWith("/ogt-pin/")) { resource.value = "ogt-pin"; updateSearch(); }
  function closeSearch() {
    search.open = false;
    (previousFocus?.isConnected ? previousFocus : search.querySelector("summary")).focus();
  }
  search.querySelector("summary").addEventListener("click", () => { previousFocus = search.querySelector("summary"); });
  search.addEventListener("toggle", () => { if (search.open) term.focus(); });
  document.getElementById("site-search-close").addEventListener("click", closeSearch);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && search.open) { event.preventDefault(); closeSearch(); return; }
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    event.preventDefault(); previousFocus = document.activeElement; search.open = true; term.focus();
  });
  document.addEventListener("click", event => { if (search.open && !search.contains(event.target)) search.open = false; });

  // Long reference pages share a compact section index without changing their content.
  if (/\/(tutorial|model-card|citations|licenses)\//.test(location.pathname)) {
    const main = document.querySelector("main");
    const headings = [...main.querySelectorAll("h2")].filter(h => !h.closest("details"));
    const container = main.querySelector(".content-section > .container, .hq-section > .hq-container");
    if (container && headings.length >= 3 && headings.every(h => container.contains(h))) {
      const wrapper = document.createElement("div"); wrapper.className = "page-document";
      wrapper.append(...container.childNodes);
      const aside = document.createElement("nav"); aside.className = "page-contents"; aside.setAttribute("aria-label", "On this page");
      const disclosure = document.createElement("details"); disclosure.open = matchMedia("(min-width: 901px)").matches;
      const summary = document.createElement("summary"); summary.textContent = "On this page";
      const links = document.createElement("div"); links.className = "section-index-links";
      headings.forEach((heading, index) => {
        if (!heading.id) heading.id = `guide-section-${index + 1}`;
        const a = document.createElement("a"); a.href = `#${heading.id}`; a.textContent = heading.textContent.trim(); links.append(a);
      });
      disclosure.append(summary, links); aside.append(disclosure); container.append(aside, wrapper); container.classList.add("has-page-contents");
      if (location.hash) requestAnimationFrame(() => {
        try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); }
        catch { /* A malformed hash must not interrupt page controls. */ }
      });
    }
  }

  // Generic examples only populate local input fields; they never launch analysis.
  document.querySelectorAll("[data-load-example]").forEach(button => {
    button.addEventListener("click", async () => {
      const target = document.querySelector(button.dataset.exampleTarget);
      const status = document.querySelector(button.dataset.exampleStatus);
      const controls = [...target.form.querySelectorAll('button, input[type="radio"]')];
      const disabledStates = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      if (status) status.textContent = "Loading example…";
      try {
        const response = await fetch(button.dataset.loadExample);
        if (!response.ok) throw new Error("Example unavailable");
        target.value = await response.text();
        target.dispatchEvent(new Event("input", { bubbles: true }));
        if (button.dataset.exampleSpecies) {
          const radio = target.form.querySelector(`input[type="radio"][value="${button.dataset.exampleSpecies}"]`);
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        if (status) status.textContent = "Example loaded. Review the input, then run the analysis.";
        target.focus();
      } catch (error) { if (status) status.textContent = "The example could not be loaded. Please try again."; }
      finally { controls.forEach((control, index) => { control.disabled = disabledStates[index]; }); }
    });
  });
})();
