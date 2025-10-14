(function () {
  const canvas = document.getElementById("layout-canvas");
  const deskDataElement = document.getElementById("layout-desk-data");
  if (!canvas || !deskDataElement) {
    return;
  }

  const desks = JSON.parse(deskDataElement.textContent || "[]");
  const cellMap = new Map();
  const deskByCell = new Map();
  const selectedCells = new Set();
  let lastSelectedKey = null;

  const form = document.getElementById("layout-form");
  const departmentInput = document.getElementById("layout-department");
  const labelInput = document.getElementById("layout-label");
  const fillInput = document.getElementById("layout-fill");
  const notesInput = document.getElementById("layout-notes");
  const selectionInfo = document.getElementById("layout-selection-info");
  const feedback = document.getElementById("layout-feedback");
  const clearButton = document.getElementById("layout-clear");

  const rows = parseInt(canvas.dataset.rows || "13", 10);
  const columns = parseInt(canvas.dataset.columns || "30", 10);
  canvas.style.setProperty("--grid-rows", String(rows));
  canvas.style.setProperty("--grid-columns", String(columns));

  desks.forEach((desk) => {
    deskByCell.set(cellKey(desk.row, desk.column), desk);
  });

  function cellKey(row, column) {
    return `${row}-${column}`;
  }

  function parseKey(key) {
    const [row, column] = key.split("-").map((value) => parseInt(value, 10));
    return { row, column };
  }

  function statusLabel(desk) {
    if (desk.status === "blocked") {
      return "Blocked";
    }
    if (desk.status === "occupied") {
      return "Occupied";
    }
    return "Free";
  }

  function updateSelectionInfo() {
    if (selectedCells.size === 0) {
      selectionInfo.textContent = "No cells selected.";
      return;
    }
    if (selectedCells.size === 1) {
      const { row, column } = parseKey([...selectedCells][0]);
      selectionInfo.textContent = `Editing cell r${String(row).padStart(2, "0")}c${String(column).padStart(2, "0")}`;
      return;
    }
    selectionInfo.textContent = `${selectedCells.size} cells selected.`;
  }

  function setFeedback(message, tone) {
    feedback.textContent = message || "";
    feedback.className = tone ? `note-text ${tone}` : "note-text";
  }

  function renderCell(row, column) {
    const key = cellKey(row, column);
    const cell = cellMap.get(key);
    if (!cell) {
      return;
    }
    const desk = deskByCell.get(key);
    cell.className = "grid-cell";
    cell.dataset.row = String(row);
    cell.dataset.column = String(column);
    cell.style.background = "";
    const coordMarkup = `<div class="grid-cell-coord">r${String(row).padStart(2, "0")} c${String(column).padStart(2, "0")}</div>`;
    cell.innerHTML = coordMarkup;
    if (desk) {
      cell.classList.add("has-desk");
      cell.classList.toggle("non-assignable", desk.is_assignable === false);
      cell.classList.toggle("blocked", desk.status === "blocked");
      cell.classList.toggle("occupied", desk.status === "occupied");
      cell.classList.toggle("free", desk.status === "free" && desk.is_assignable !== false);
      const isWalkway = (desk.department || "").toLowerCase() === "walkway";
      cell.classList.toggle("walkway", isWalkway);
      cell.dataset.deskId = desk.identifier;
      if (desk.status !== "blocked") {
        const fill = desk.fill_color || desk.department_color || "";
        if (fill) {
          cell.style.background = fill;
        }
      }
      if (isWalkway) {
        cell.innerHTML = "";
      } else {
        const pill = desk.is_assignable === false ? "" : `<div class="status-pill">${statusLabel(desk)}</div>`;
        cell.innerHTML = `
          <div class="desk-label">${desk.label}</div>
          ${pill}
          <div class="grid-cell-meta">${desk.department}</div>
          ${coordMarkup}
        `;
      }
    } else {
      cell.classList.add("empty-cell-state");
      cell.innerHTML = `${coordMarkup}<span class="empty-cell">Empty</span>`;
    }
    if (selectedCells.has(key)) {
      cell.classList.add("selected");
    }
  }

  function buildGrid() {
    canvas.innerHTML = "";
    cellMap.clear();
    for (let row = 1; row <= rows; row += 1) {
      for (let column = 1; column <= columns; column += 1) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        const key = cellKey(row, column);
        cell.addEventListener("click", (event) => {
          if (event.shiftKey && lastSelectedKey) {
            const { row: lastRow, column: lastColumn } = parseKey(lastSelectedKey);
            selectRange(lastRow, lastColumn, row, column);
          } else if (event.metaKey || event.ctrlKey) {
            toggleCellSelection(key);
          } else if (selectedCells.size > 1 && !selectedCells.has(key)) {
            selectedCells.clear();
            selectedCells.add(key);
          } else {
            toggleCellSelection(key);
          }
          lastSelectedKey = key;
          syncFormWithSelection();
          updateSelectionInfo();
          refreshSelectedStyles();
        });
        canvas.appendChild(cell);
        cellMap.set(key, cell);
        renderCell(row, column);
      }
    }
  }

  function toggleCellSelection(key) {
    if (selectedCells.has(key)) {
      selectedCells.delete(key);
    } else {
      selectedCells.add(key);
    }
  }

  function refreshSelectedStyles() {
    cellMap.forEach((cell, key) => {
      if (selectedCells.has(key)) {
        cell.classList.add("selected");
      } else {
        cell.classList.remove("selected");
      }
    });
  }

  function selectRange(startRow, startCol, endRow, endCol) {
    const rowMin = Math.min(startRow, endRow);
    const rowMax = Math.max(startRow, endRow);
    const colMin = Math.min(startCol, endCol);
    const colMax = Math.max(startCol, endCol);
    selectedCells.clear();
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let column = colMin; column <= colMax; column += 1) {
        selectedCells.add(cellKey(row, column));
      }
    }
  }

  function syncFormWithSelection() {
    setFeedback("");
    if (selectedCells.size !== 1) {
      form.reset();
      return;
    }
    const firstKey = Array.from(selectedCells)[0];
    const desk = deskByCell.get(firstKey);
    if (!desk) {
      form.reset();
      return;
    }
    departmentInput.value = String(desk.department_id || "");
    labelInput.value = desk.label || "";
    fillInput.value = desk.fill_color || "";
    notesInput.value = desk.notes || "";
  }

  function selectedCellsPayload() {
    return [...selectedCells].map((key) => parseKey(key));
  }

  async function sendUpdate(payload) {
    try {
      const response = await fetch("/api/layout/update/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Unable to update layout." }));
        throw new Error(data.error || "Unable to update layout.");
      }
      return await response.json();
    } catch (error) {
      throw new Error(error.message || "Network error. Please try again.");
    }
  }

  function applyServerResult(result) {
    if (Array.isArray(result.updated)) {
      result.updated.forEach((desk) => {
        const key = cellKey(desk.row, desk.column);
        deskByCell.set(key, desk);
        renderCell(desk.row, desk.column);
      });
    }
    if (Array.isArray(result.cleared)) {
      result.cleared.forEach(({ row, column }) => {
        const key = cellKey(row, column);
        deskByCell.delete(key);
        renderCell(row, column);
      });
    }
    refreshSelectedStyles();
    syncFormWithSelection();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (selectedCells.size === 0) {
      setFeedback("Select at least one cell before assigning.", "warning");
      return;
    }
    if (!departmentInput.value) {
      setFeedback("Choose a department for the selected cells.", "warning");
      return;
    }
    const payload = {
      action: "assign",
      cells: selectedCellsPayload(),
      data: {
        department: parseInt(departmentInput.value, 10),
        label: labelInput.value.trim(),
        fill_color: fillInput.value.trim(),
        notes: notesInput.value.trim(),
      },
    };
    try {
      const result = await sendUpdate(payload);
      applyServerResult(result);
      setFeedback(result.message || "Cells updated.", "success");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  });

  clearButton.addEventListener("click", async () => {
    if (selectedCells.size === 0) {
      setFeedback("Select the cells you want to clear.", "warning");
      return;
    }
    if (!window.confirm("Remove desks from the selected cells? This will also delete related assignments.")) {
      return;
    }
    const payload = {
      action: "clear",
      cells: selectedCellsPayload(),
    };
    try {
      const result = await sendUpdate(payload);
      applyServerResult(result);
      form.reset();
      setFeedback(result.message || "Cells cleared.", "success");
    } catch (error) {
      setFeedback(error.message, "danger");
    }
  });

  buildGrid();
  updateSelectionInfo();
})();
