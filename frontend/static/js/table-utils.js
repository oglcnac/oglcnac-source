(function () {
  const exportButtons = {
    name: "primary",
    buttons: ["copy", "csv", "excel", "pdf"],
  };

  function textCell(row, value) {
    const cell = row.insertCell();
    cell.className = "align-middle";
    cell.textContent = value ?? "";
    return cell;
  }

  function linkCell(row, href, label, strong) {
    const cell = row.insertCell();
    cell.className = "align-middle";
    if (!label) {
      return cell;
    }
    const link = document.createElement("a");
    link.href = href;
    const content = strong ? document.createElement("strong") : document.createElement("span");
    content.textContent = label;
    link.appendChild(content);
    cell.appendChild(link);
    return cell;
  }

  function pmidCell(row, pmid) {
    return linkCell(row, `https://www.ncbi.nlm.nih.gov/pubmed/?term=${encodeURIComponent(pmid)}`, pmid, false);
  }

  function startExportTable(selector, options) {
    return $(selector).DataTable({
      scrollX: true,
      dom: "Bfrtip",
      buttons: exportButtons,
      ...(options || {}),
    });
  }

  function resetTable(selector, bodyId) {
    if ($.fn.DataTable.isDataTable(selector)) {
      $(selector).DataTable().destroy();
    }
    document.getElementById(bodyId).innerHTML = "";
  }

  window.OglcnacUi = {
    textCell,
    linkCell,
    pmidCell,
    resetTable,
    startExportTable,
  };
})();
