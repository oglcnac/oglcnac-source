(function (root, factory) {
  const api = factory(root && root.document ? root : null);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && root.document) {
    root.OglcnacTables = api;
  }
})(typeof window === "undefined" ? globalThis : window, function (browser) {
  "use strict";

  const registry = new Map();

  function cellText(cell) {
    if (cell && typeof cell === "object" && "text" in cell) {
      return String(cell.text ?? "");
    }
    return String(cell ?? "");
  }

  function normalizedSearchText(value) {
    return cellText(value).trim().toLocaleLowerCase();
  }

  function filterRows(rows, query) {
    const wanted = normalizedSearchText(query);
    if (!wanted) {
      return rows.slice();
    }
    return rows.filter((row) =>
      row.some((cell) => normalizedSearchText(cell).includes(wanted)),
    );
  }

  function compareCells(left, right) {
    const leftText = cellText(left).trim();
    const rightText = cellText(right).trim();
    const leftNumber = Number(leftText);
    const rightNumber = Number(rightText);
    if (
      leftText &&
      rightText &&
      Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber)
    ) {
      return leftNumber - rightNumber;
    }
    return leftText.localeCompare(rightText, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function sortRows(rows, columnIndex, direction) {
    const multiplier = direction === "desc" ? -1 : 1;
    return rows
      .map((row, index) => ({ index, row }))
      .sort((left, right) => {
        const compared =
          compareCells(left.row[columnIndex], right.row[columnIndex]) *
          multiplier;
        return compared || left.index - right.index;
      })
      .map((entry) => entry.row);
  }

  function pageRows(rows, page, pageSize) {
    const start = Math.max(0, page) * pageSize;
    return rows.slice(start, start + pageSize);
  }

  function delimitedCell(value, delimiter) {
    let text = cellText(value);
    if (delimiter === "\t") {
      return text.replace(/[\t\r\n]+/g, " ");
    }
    text = text.replace(/\r\n|\r|\n/g, "\r\n");
    if (/[",\r\n]/.test(text)) {
      text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function rowsToText(headers, rows, delimiter) {
    const lineEnding = delimiter === "," ? "\r\n" : "\n";
    return [headers, ...rows]
      .map((row) =>
        row.map((cell) => delimitedCell(cell, delimiter)).join(delimiter),
      )
      .join(lineEnding);
  }

  function elementFor(tableOrId) {
    if (!browser) {
      throw new Error("NativeTable requires a browser document.");
    }
    if (typeof tableOrId !== "string") {
      return tableOrId;
    }
    const id = tableOrId.startsWith("#") ? tableOrId.slice(1) : tableOrId;
    return browser.document.getElementById(id);
  }

  function button(label, attributes) {
    const element = browser.document.createElement("button");
    element.type = "button";
    element.textContent = label;
    Object.entries(attributes || {}).forEach(([name, value]) =>
      element.setAttribute(name, value),
    );
    return element;
  }

  function renderCell(row, descriptor) {
    const cell = row.insertCell();
    cell.className = "align-middle";
    if (descriptor && typeof descriptor === "object") {
      if (typeof descriptor.render === "function") {
        descriptor.render(cell);
        return;
      }
      if (descriptor.href && cellText(descriptor)) {
        const link = browser.document.createElement("a");
        link.href = descriptor.href;
        if (descriptor.external) {
          link.rel = "noopener";
        }
        const content = descriptor.strong
          ? browser.document.createElement("strong")
          : browser.document.createElement("span");
        content.textContent = cellText(descriptor);
        link.appendChild(content);
        cell.appendChild(link);
        return;
      }
    }
    cell.textContent = cellText(descriptor);
  }

  class NativeTable {
    constructor(tableOrId, options) {
      this.table = elementFor(tableOrId);
      if (!this.table || this.table.tagName !== "TABLE") {
        throw new Error("NativeTable requires an existing table element.");
      }
      if (!this.table.id) {
        throw new Error("NativeTable requires a table id.");
      }
      this.options = {
        emptyMessage: "No matching records.",
        initialMessage: "Search above to find curated records.",
        filename: `${this.table.id}.csv`,
        pageSize: 10,
        pageSizes: [10, 25, 50, 100],
        ...(options || {}),
      };
      if (this.options.mobileColumns && browser.matchMedia("(max-width:700px)").matches && !(options && options.pageSize)) {
        this.options.pageSize = 5;
        this.options.pageSizes = [5, 10, 25, 50, 100];
      }
      this.headers = Array.from(this.table.querySelectorAll("thead th")).map(
        (header) => header.textContent.trim(),
      );
      this.body =
        this.table.tBodies[0] || this.table.appendChild(browser.document.createElement("tbody"));
      this.rows = [];
      this.filteredRows = [];
      this.visibleRows = [];
      this.totalRows = 0;
      this.page = 0;
      this.pageSize = this.options.pageSize;
      this.sortColumn = null;
      this.sortDirection = "asc";
      this.loading = false;
      this.initial = true;
      this.error = "";
      this.context = "";
      this.hiddenColumns = new Set();
      this.buildControls();
      this.buildSortableHeaders();
      this.render();
      registry.set(this.table.id, this);
    }

    buildControls() {
      const controls = browser.document.createElement("div");
      controls.className = "native-table-controls";
      this.controls = controls;

      const filterLabel = browser.document.createElement("label");
      filterLabel.className = "native-table-filter";
      const filterText = browser.document.createElement("span");
      filterText.textContent = "Filter results";
      this.filterInput = browser.document.createElement("input");
      this.filterInput.type = "search";
      this.filterInput.setAttribute("data-table-filter-for", this.table.id);
      this.filterInput.autocomplete = "off";
      filterLabel.append(filterText, this.filterInput);

      const actions = browser.document.createElement("div");
      actions.className = "native-table-actions";
      this.copyButton = button("Copy visible rows", {
        "data-table-copy-for": this.table.id,
      });
      this.csvButton = button("Download filtered CSV", {
        "data-table-csv-for": this.table.id,
      });
      this.resetButton = button("Reset table", { "data-table-reset-for": this.table.id });
      actions.append(this.resetButton, this.copyButton, this.csvButton);
      if (this.headers.length >= 8) {
        const picker = browser.document.createElement("details");
        picker.className = "native-column-picker";
        const summary = browser.document.createElement("summary"); summary.textContent = "Columns";
        const choices = browser.document.createElement("fieldset");
        const legend = browser.document.createElement("legend"); legend.textContent = "Visible table columns";
        choices.appendChild(legend);
        this.columnInputs = this.headers.map((name, index) => {
          const label = browser.document.createElement("label");
          const input = browser.document.createElement("input"); input.type = "checkbox"; input.checked = true;
          input.addEventListener("change", () => {
            if (input.checked) this.hiddenColumns.delete(index); else this.hiddenColumns.add(index);
            this.applyColumns(); this.updateOverflow();
            this.resetButton.disabled = false;
          });
          label.append(input, browser.document.createTextNode(name)); choices.appendChild(label); return input;
        });
        const hint = browser.document.createElement("p"); hint.textContent = "CSV downloads include every field.";
        choices.appendChild(hint); picker.append(summary, choices); actions.appendChild(picker);
        const positionChoices = () => {
          if (!picker.open) return;
          const bounds = summary.getBoundingClientRect();
          const header = browser.document.querySelector('.site-header');
          const topEdge = Math.max(8, header ? header.getBoundingClientRect().bottom : 0);
          const above = bounds.top - topEdge - 8;
          const below = browser.innerHeight - bounds.bottom - 8;
          const openAbove = below < 220 && above > below;
          choices.style.top = openAbove ? 'auto' : 'calc(100% + 8px)';
          choices.style.bottom = openAbove ? 'calc(100% + 8px)' : 'auto';
          choices.style.maxHeight = `${Math.max(80, Math.min(360, openAbove ? above : below))}px`;
        };
        picker.addEventListener("toggle", positionChoices);
        browser.addEventListener("resize", positionChoices);
        picker.addEventListener("keydown", event => { if (event.key === "Escape") { picker.open = false; summary.focus(); } });
      }
      controls.append(filterLabel, actions);

      if (this.options.mobileColumns) {
        const sortLabel = browser.document.createElement("label");
        sortLabel.className = "native-mobile-sort";
        sortLabel.textContent = "Sort records ";
        this.mobileSort = browser.document.createElement("select");
        const original = browser.document.createElement("option");
        original.value = "";
        original.textContent = "Original order";
        this.mobileSort.appendChild(original);
        this.headers.forEach((label, index) => {
          ["asc", "desc"].forEach((direction) => {
            const option = browser.document.createElement("option");
            option.value = `${index}:${direction}`;
            option.textContent = `${label} · ${direction === "asc" ? "ascending" : "descending"}`;
            this.mobileSort.appendChild(option);
          });
        });
        this.mobileSort.addEventListener("change", () => {
          const [column, direction] = this.mobileSort.value.split(":");
          this.sortColumn = column === "" ? null : Number(column);
          this.sortDirection = direction || "asc";
          this.page = 0;
          this.render();
        });
        sortLabel.appendChild(this.mobileSort);
        controls.appendChild(sortLabel);
      }

      this.status = browser.document.createElement("p");
      this.status.className = "native-table-status";
      this.status.setAttribute("data-table-status-for", this.table.id);
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");

      this.actionStatus = browser.document.createElement("span");
      this.actionStatus.className = "visually-hidden";
      this.actionStatus.setAttribute("aria-live", "polite");

      this.pagination = browser.document.createElement("div");
      this.pagination.className = "native-table-pagination";
      this.pagination.setAttribute("data-table-pagination-for", this.table.id);
      this.previousButton = button("Previous");
      this.nextButton = button("Next");
      this.pageStatus = browser.document.createElement("span");
      const sizeLabel = browser.document.createElement("label");
      sizeLabel.textContent = "Rows per page ";
      this.sizeSelect = browser.document.createElement("select");
      this.options.pageSizes.forEach((size) => {
        const option = browser.document.createElement("option");
        option.value = String(size);
        option.textContent = String(size);
        option.selected = size === this.pageSize;
        this.sizeSelect.appendChild(option);
      });
      sizeLabel.appendChild(this.sizeSelect);
      this.pagination.append(
        this.previousButton,
        this.pageStatus,
        this.nextButton,
        sizeLabel,
      );

      const tableContainer =
        this.table.parentElement &&
        this.table.parentElement.classList.contains("table-scroll")
          ? this.table.parentElement
          : this.table;
      this.tableContainer = tableContainer;
      this.scrollHint = browser.document.createElement(tableContainer === this.table ? "caption" : "p");
      this.scrollHint.className = "table-scroll-hint";
      this.scrollHint.textContent = "↔ Scroll horizontally to view every field.";
      this.scrollHint.id = `${this.table.id}-scroll-hint`;
      this.scrollHint.hidden = true;
      tableContainer.setAttribute("aria-describedby", this.scrollHint.id);
      tableContainer.prepend(this.scrollHint);
      const updateOverflow = () => {
        this.scrollHint.hidden = !this.totalRows || tableContainer.clientWidth === 0 || tableContainer.scrollWidth <= tableContainer.clientWidth + 1;
      };
      this.updateOverflow = () => browser.requestAnimationFrame(updateOverflow);
      if (browser.ResizeObserver) {
        this.resizeObserver = new browser.ResizeObserver(updateOverflow);
        this.resizeObserver.observe(tableContainer);
      }
      if (this.options.mobileColumns) {
        tableContainer.classList.add("has-record-cards");
        this.cards = browser.document.createElement("div");
        this.cards.className = "native-record-cards";
        this.cards.setAttribute("role", "region");
        this.cards.setAttribute("aria-label", `${this.options.label || "Curated"} records`);
        tableContainer.after(this.cards);
      }
      tableContainer.parentNode.insertBefore(controls, tableContainer);
      tableContainer.parentNode.insertBefore(this.status, tableContainer);
      tableContainer.parentNode.insertBefore(
        this.pagination,
        (this.cards || tableContainer).nextSibling,
      );
      tableContainer.parentNode.insertBefore(
        this.actionStatus,
        this.pagination.nextSibling,
      );

      this.filterInput.addEventListener("input", () => {
        this.page = 0;
        this.render();
      });
      this.sizeSelect.addEventListener("change", () => {
        this.pageSize = Number(this.sizeSelect.value);
        this.page = 0;
        this.render();
      });
      this.previousButton.addEventListener("click", () => {
        if (this.page > 0) {
          this.page -= 1;
          this.render();
        }
      });
      this.nextButton.addEventListener("click", () => {
        if ((this.page + 1) * this.pageSize < this.filteredRows.length) {
          this.page += 1;
          this.render();
        }
      });
      this.copyButton.addEventListener("click", () => this.copyVisibleRows());
      this.csvButton.addEventListener("click", () => this.downloadFilteredCsv());
      this.resetButton.addEventListener("click", () => {
        this.resetState(); this.render(); this.actionStatus.textContent = "Table filters, sort order, page size and columns reset.";
      });
    }

    buildSortableHeaders() {
      this.sortHeaders = Array.from(this.table.querySelectorAll("thead th"));
      this.sortHeaders.forEach(
        (header, index) => {
          const sortButton = button(this.headers[index]);
          sortButton.className = "native-table-sort";
          sortButton.setAttribute("aria-label", `Sort by ${this.headers[index]}`);
          sortButton.addEventListener("click", () => {
            if (this.sortColumn === index) {
              this.sortDirection =
                this.sortDirection === "asc" ? "desc" : "asc";
            } else {
              this.sortColumn = index;
              this.sortDirection = "asc";
            }
            this.page = 0;
            this.render();
          });
          header.textContent = "";
          header.appendChild(sortButton);
        },
      );
      this.updateSortHeaders();
    }

    updateSortHeaders() {
      this.sortHeaders.forEach((header, index) => {
        const active = this.sortColumn === index;
        const direction = active ? this.sortDirection : "none";
        header.setAttribute(
          "aria-sort",
          direction === "asc"
            ? "ascending"
            : direction === "desc"
              ? "descending"
              : "none",
        );
        const sortButton = header.querySelector(".native-table-sort");
        if (!sortButton) return;
        if (!active) {
          sortButton.setAttribute("aria-label", `Sort by ${this.headers[index]}`);
          return;
        }
        const nextDirection =
          this.sortDirection === "asc" ? "descending" : "ascending";
        sortButton.setAttribute(
          "aria-label",
          `${this.headers[index]}, sorted ${this.sortDirection === "asc" ? "ascending" : "descending"}. Activate to sort ${nextDirection}.`,
        );
      });
    }

    setRows(rows, options) {
      this.initial = false;
      const preserveState = Boolean(options && options.preserveState);
      if (!preserveState) {
        this.resetState();
      }
      this.rows = Array.isArray(rows) ? rows : [];
      this.totalRows = this.rows.length;
      this.context = (options && options.context) || this.context;
      this.loading = false;
      this.error = "";
      this.render();
      return this;
    }

    resetState() {
      this.filterInput.value = "";
      this.page = 0;
      this.pageSize = this.options.pageSize;
      this.sizeSelect.value = String(this.options.pageSize);
      this.sortColumn = null;
      this.sortDirection = "asc";
      this.hiddenColumns.clear();
      if (this.columnInputs) this.columnInputs.forEach(input => { input.checked = true; input.disabled = false; });
      return this;
    }

    applyColumns() {
      Array.from(this.table.rows).forEach(row => Array.from(row.cells).forEach((cell, index) => { cell.hidden = this.hiddenColumns.has(index); }));
      if (this.columnInputs) this.columnInputs.forEach((input, index) => { input.disabled = !this.hiddenColumns.has(index) && this.hiddenColumns.size === this.headers.length - 1; });
    }

    setLoading(message) {
      this.initial = false;
      this.loading = true;
      this.error = "";
      this.body.replaceChildren();
      if (this.cards) this.cards.replaceChildren();
      this.controls.hidden = false;
      this.controls.style.visibility = "hidden";
      this.pagination.hidden = true;
      this.tableContainer.hidden = true;
      this.scrollHint.hidden = true;
      this.status.dataset.tableState = "loading";
      this.status.textContent = message || "Loading records…";
      this.setControlsDisabled(true);
      return this;
    }

    setError(message) {
      this.initial = false;
      this.rows = [];
      this.filteredRows = [];
      this.visibleRows = [];
      this.totalRows = 0;
      this.loading = false;
      this.error = message || "Records could not be loaded.";
      this.render();
      return this;
    }

    setControlsDisabled(disabled) {
      [
        this.filterInput,
        this.copyButton,
        this.csvButton,
        this.resetButton,
        this.previousButton,
        this.nextButton,
        this.sizeSelect,
      ].forEach((control) => {
        control.disabled = disabled;
      });
    }

    render() {
      if (this.loading) {
        return;
      }
      const filtered = filterRows(this.rows, this.filterInput.value);
      this.filteredRows =
        this.sortColumn === null
          ? filtered
          : sortRows(filtered, this.sortColumn, this.sortDirection);
      const pageCount = Math.max(
        1,
        Math.ceil(this.filteredRows.length / this.pageSize),
      );
      this.page = Math.min(this.page, pageCount - 1);
      this.visibleRows = pageRows(
        this.filteredRows,
        this.page,
        this.pageSize,
      );
      this.body.replaceChildren();
      this.visibleRows.forEach((values) => {
        const row = this.body.insertRow();
        values.forEach((value) => renderCell(row, value));
      });
      this.renderCards();
      this.applyColumns();

      if (this.error) {
        this.status.dataset.tableState = "error";
        this.status.textContent = this.error;
      } else if (this.initial) {
        this.status.dataset.tableState = "initial";
        this.status.textContent = this.options.initialMessage;
      } else if (!this.filteredRows.length) {
        this.status.dataset.tableState = "empty";
        this.status.textContent = this.options.emptyMessage;
      } else {
        const start = this.page * this.pageSize + 1;
        const end = start + this.visibleRows.length - 1;
        this.status.dataset.tableState = "ready";
        this.status.textContent = `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${this.filteredRows.length.toLocaleString()} ${this.options.rowLabel || "records"}.`;
      }
      this.pageStatus.textContent = `Page ${this.page + 1} of ${pageCount}`;
      this.setControlsDisabled(false);
      this.copyButton.disabled = !this.visibleRows.length;
      this.csvButton.disabled = !this.filteredRows.length;
      this.resetButton.disabled = !this.filterInput.value && this.sortColumn === null && !this.page && this.pageSize === this.options.pageSize && !this.hiddenColumns.size;
      this.previousButton.disabled = this.page === 0;
      this.nextButton.disabled = this.page + 1 >= pageCount;
      this.controls.hidden = !this.totalRows;
      this.controls.style.visibility = "";
      this.pagination.hidden = !this.totalRows;
      this.tableContainer.hidden = !this.totalRows;
      if (this.mobileSort) this.mobileSort.value = this.sortColumn === null ? "" : `${this.sortColumn}:${this.sortDirection}`;
      this.updateSortHeaders();
      this.updateOverflow();
    }

    renderCards() {
      if (!this.cards) return;
      this.cards.replaceChildren();
      this.visibleRows.forEach((values, rowIndex) => {
        const article = browser.document.createElement("article");
        article.className = "native-record-card";
        article.setAttribute("aria-label", `Record ${this.page * this.pageSize + rowIndex + 1}`);
        const fields = (indices) => {
          const list = browser.document.createElement("dl");
          indices.forEach((index) => {
            const group = browser.document.createElement("div");
            const label = browser.document.createElement("dt");
            label.textContent = this.options.mobileLabels?.[index] || this.headers[index];
            const value = browser.document.createElement("dd");
            const temporaryRow = browser.document.createElement("tr");
            renderCell(temporaryRow, values[index]);
            value.className = temporaryRow.firstChild.className;
            value.append(...temporaryRow.firstChild.childNodes);
            if (!value.textContent.trim()) value.textContent = "Not reported";
            group.append(label, value);
            list.appendChild(group);
          });
          return list;
        };
        article.appendChild(fields(this.options.mobileColumns));
        const remaining = this.headers.map((_, i) => i).filter((i) => !this.options.mobileColumns.includes(i));
        if (remaining.length) {
          const details = browser.document.createElement("details");
          const summary = browser.document.createElement("summary");
          summary.textContent = "All record fields";
          details.append(summary, fields(remaining));
          article.appendChild(details);
        }
        this.cards.appendChild(article);
      });
    }

    async copyVisibleRows() {
      const text = rowsToText(this.headers, this.visibleRows, "\t");
      try {
        await browser.navigator.clipboard.writeText(text);
        this.actionStatus.textContent = `${this.visibleRows.length} visible rows copied.`;
      } catch (error) {
        this.actionStatus.textContent =
          "Copy failed. Your browser did not grant clipboard access.";
      }
    }

    downloadFilteredCsv() {
      const csv = rowsToText(this.headers, this.filteredRows, ",");
      const blob = new browser.Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = browser.URL.createObjectURL(blob);
      const link = browser.document.createElement("a");
      link.href = url;
      link.download = this.options.filename;
      link.hidden = true;
      browser.document.body.appendChild(link);
      link.click();
      link.remove();
      browser.URL.revokeObjectURL(url);
      this.actionStatus.textContent = `${this.filteredRows.length} filtered rows exported.`;
    }
  }

  function create(tableOrId, options) {
    const table = elementFor(tableOrId);
    if (table && registry.has(table.id)) {
      return registry.get(table.id);
    }
    return new NativeTable(table, options);
  }

  function get(id) {
    return registry.get(String(id).replace(/^#/, ""));
  }

  return {
    NativeTable,
    cellText,
    create,
    filterRows,
    get,
    pageRows,
    rowsToText,
    sortRows,
  };
});
