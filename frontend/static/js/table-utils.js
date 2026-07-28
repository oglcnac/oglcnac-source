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
    if (/[",\r\n]/.test(text)) {
      text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function rowsToText(headers, rows, delimiter) {
    return [headers, ...rows]
      .map((row) =>
        row.map((cell) => delimitedCell(cell, delimiter)).join(delimiter),
      )
      .join("\n");
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
        filename: `${this.table.id}.csv`,
        pageSize: 10,
        pageSizes: [10, 25, 50, 100],
        ...(options || {}),
      };
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
      this.error = "";
      this.context = "";
      this.buildControls();
      this.buildSortableHeaders();
      this.render();
      registry.set(this.table.id, this);
    }

    buildControls() {
      const controls = browser.document.createElement("div");
      controls.className = "native-table-controls";

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
      actions.append(this.copyButton, this.csvButton);
      controls.append(filterLabel, actions);

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
      tableContainer.parentNode.insertBefore(controls, tableContainer);
      tableContainer.parentNode.insertBefore(this.status, tableContainer);
      tableContainer.parentNode.insertBefore(
        this.pagination,
        tableContainer.nextSibling,
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
    }

    buildSortableHeaders() {
      Array.from(this.table.querySelectorAll("thead th")).forEach(
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
    }

    setRows(rows, options) {
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
      return this;
    }

    setLoading(message) {
      this.loading = true;
      this.error = "";
      this.body.replaceChildren();
      this.status.dataset.tableState = "loading";
      this.status.textContent = message || "Loading records…";
      this.setControlsDisabled(true);
      return this;
    }

    setError(message) {
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

      if (this.error) {
        this.status.dataset.tableState = "error";
        this.status.textContent = this.error;
      } else if (!this.filteredRows.length) {
        this.status.dataset.tableState = "empty";
        this.status.textContent = this.options.emptyMessage;
      } else {
        const start = this.page * this.pageSize + 1;
        const end = start + this.visibleRows.length - 1;
        this.status.dataset.tableState = "ready";
        this.status.textContent = `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${this.filteredRows.length.toLocaleString()} records.`;
      }
      this.pageStatus.textContent = `Page ${this.page + 1} of ${pageCount}`;
      this.setControlsDisabled(false);
      this.copyButton.disabled = !this.visibleRows.length;
      this.csvButton.disabled = !this.filteredRows.length;
      this.previousButton.disabled = this.page === 0;
      this.nextButton.disabled = this.page + 1 >= pageCount;
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
