(function () {
  const canvas = document.getElementById("layout-canvas");
  const deskDataElement = document.getElementById("layout-desk-data");
  if (!canvas || !deskDataElement) {
    return;
  }

  const floorplanWrapper = canvas.closest(".floorplan-wrapper");

  if (floorplanWrapper) {
    const dragState = {
      pointerId: null,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
      hasMoved: false,
    };

    const PAN_THRESHOLD_SQUARED = 9;

    const releasePointer = (pointerId) => {
      if (pointerId == null) {
        return;
      }
      try {
        const canRelease =
          typeof floorplanWrapper.releasePointerCapture === "function" &&
          (typeof floorplanWrapper.hasPointerCapture !== "function" ||
            floorplanWrapper.hasPointerCapture(pointerId));
        if (canRelease) {
          floorplanWrapper.releasePointerCapture(pointerId);
        }
      } catch (error) {
        // ignore browsers that do not support pointer capture
      }
    };

    const endDrag = (event) => {
      if (dragState.pointerId === null || event.pointerId !== dragState.pointerId) {
        return;
      }
      releasePointer(dragState.pointerId);
      dragState.pointerId = null;
      dragState.hasMoved = false;
      dragState.startX = 0;
      dragState.startY = 0;
      dragState.scrollLeft = 0;
      dragState.scrollTop = 0;
      floorplanWrapper.classList.remove("is-dragging");
    };

    floorplanWrapper.addEventListener("pointerdown", (event) => {
      if (event.button !== 2) {
        return;
      }
      if (event.pointerType && event.pointerType !== "mouse") {
        return;
      }
      if (dragState.pointerId !== null) {
        releasePointer(dragState.pointerId);
        floorplanWrapper.classList.remove("is-dragging");
      }
      dragState.pointerId = event.pointerId;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.scrollLeft = floorplanWrapper.scrollLeft;
      dragState.scrollTop = floorplanWrapper.scrollTop;
      dragState.hasMoved = false;
      try {
        if (typeof floorplanWrapper.setPointerCapture === "function") {
          floorplanWrapper.setPointerCapture(event.pointerId);
        }
      } catch (error) {
        // ignore browsers that do not support pointer capture
      }
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    });

    floorplanWrapper.addEventListener("pointermove", (event) => {
      if (dragState.pointerId === null || event.pointerId !== dragState.pointerId) {
        return;
      }
      if (typeof event.buttons === "number" && (event.buttons & 2) === 0) {
        endDrag(event);
        return;
      }
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.hasMoved) {
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared >= PAN_THRESHOLD_SQUARED) {
          dragState.hasMoved = true;
          floorplanWrapper.classList.add("is-dragging");
        }
      }
      if (!dragState.hasMoved) {
        return;
      }
      floorplanWrapper.scrollLeft = dragState.scrollLeft - deltaX;
      floorplanWrapper.scrollTop = dragState.scrollTop - deltaY;
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    });

    const cancelDrag = (event) => {
      endDrag(event);
    };

    floorplanWrapper.addEventListener("pointerleave", cancelDrag);
    floorplanWrapper.addEventListener("pointercancel", cancelDrag);
    floorplanWrapper.addEventListener("pointerup", (event) => {
      endDrag(event);
    });
    floorplanWrapper.addEventListener("contextmenu", (event) => {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    });
  }

  const desks = JSON.parse(deskDataElement.textContent || "[]");
  const cellMap = new Map();
  const deskByCell = new Map();
  const selectedCells = new Set();
  let lastSelectedKey = null;
  let activeMode = "layout";
  const selectionDragState = {
    pointerId: null,
    startRow: 0,
    startColumn: 0,
    startX: 0,
    startY: 0,
    lastRow: 0,
    lastColumn: 0,
    hasMoved: false,
  };
  let suppressNextClick = false;

  const layoutForm = document.getElementById("layout-form");
  const departmentInput = document.getElementById("layout-department");
  const labelInput = document.getElementById("layout-label");
  const fillInput = document.getElementById("layout-fill");
  const notesInput = document.getElementById("layout-notes");
  const selectionInfo = document.getElementById("layout-selection-info");
  const selectionList = document.getElementById("layout-selection-list");
  const layoutFeedback = document.getElementById("layout-feedback");
  const clearButton = document.getElementById("layout-clear");

  const assignmentForm = document.getElementById("assignment-form");
  const assignmentSelectionInfo = document.getElementById("assignment-selection-info");
  const assignmentName = document.getElementById("assignment-name");
  const assignmentType = document.getElementById("assignment-type");
  const assignmentDuration = document.getElementById("assignment-duration");
  const assignmentStart = document.getElementById("assignment-start");
  const assignmentEnd = document.getElementById("assignment-end");
  const assignmentNote = document.getElementById("assignment-note");
  const assignmentCreatedBy = document.getElementById("assignment-created-by");
  const assignmentFeedback = document.getElementById("assignment-feedback");
  const assignmentSubmit = document.getElementById("assignment-submit");

  const blockForm = document.getElementById("block-form");
  const blockSelectionInfo = document.getElementById("block-selection-info");
  const blockName = document.getElementById("block-name");
  const blockDuration = document.getElementById("block-duration");
  const blockStart = document.getElementById("block-start");
  const blockEnd = document.getElementById("block-end");
  const blockReason = document.getElementById("block-reason");
  const blockCreatedBy = document.getElementById("block-created-by");
  const blockFeedback = document.getElementById("block-feedback");
  const blockSubmit = document.getElementById("block-submit");

  const modeButtons = document.querySelectorAll(".admin-mode-button");
  const modePanels = document.querySelectorAll(".mode-panel");

  const feedbackTargets = {
    layout: layoutFeedback,
    assignment: assignmentFeedback,
    block: blockFeedback,
  };

  const SELECTION_DRAG_THRESHOLD_SQUARED = 9;

  function releaseSelectionPointer(pointerId) {
    if (pointerId == null) {
      return;
    }
    try {
      const canRelease =
        typeof canvas.releasePointerCapture === "function" &&
        (typeof canvas.hasPointerCapture !== "function" || canvas.hasPointerCapture(pointerId));
      if (canRelease) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch (error) {
      // ignore browsers without pointer capture support
    }
  }

  function getCellFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const directCell = target ? target.closest(".grid-cell") : null;
    if (directCell) {
      return directCell;
    }
    const fallback = document.elementFromPoint(event.clientX, event.clientY);
    return fallback instanceof Element ? fallback.closest(".grid-cell") : null;
  }

  function parseCellElement(cell) {
    if (!cell) {
      return null;
    }
    const row = parseInt(cell.dataset.row || "0", 10);
    const column = parseInt(cell.dataset.column || "0", 10);
    if (!row || !column) {
      return null;
    }
    return { row, column, key: cellKey(row, column) };
  }

  function handleSelectionChange(lastKey) {
    if (lastKey) {
      lastSelectedKey = lastKey;
    }
    syncFormsWithSelection();
    updateSelectionInfo();
    refreshSelectedStyles();
  }

  function endSelectionDrag(event, cancelled) {
    if (selectionDragState.pointerId === null || event.pointerId !== selectionDragState.pointerId) {
      return;
    }
    releaseSelectionPointer(selectionDragState.pointerId);
    const didMove = selectionDragState.hasMoved;
    selectionDragState.pointerId = null;
    selectionDragState.hasMoved = false;
    selectionDragState.startRow = 0;
    selectionDragState.startColumn = 0;
    selectionDragState.startX = 0;
    selectionDragState.startY = 0;
    selectionDragState.lastRow = 0;
    selectionDragState.lastColumn = 0;
    if (!cancelled && didMove) {
      const cell = getCellFromEvent(event);
      if (parseCellElement(cell)) {
        suppressNextClick = true;
      }
    }
  }

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

  function setFeedback(message, tone, mode = "layout") {
    const target = feedbackTargets[mode];
    if (!target) {
      return;
    }
    target.textContent = message || "";
    target.className = "note-text";
    if (tone) {
      target.classList.add(tone);
    }
  }

  function clearFeedback(mode) {
    setFeedback("", "", mode);
  }

  function setActiveMode(mode) {
    if (!mode) {
      return;
    }
    activeMode = mode;
    modeButtons.forEach((button) => {
      const isActive = button.dataset.adminMode === mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    modePanels.forEach((panel) => {
      const isActive = panel.dataset.modePanel === mode;
      panel.classList.toggle("active", isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    clearFeedback(mode);
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
    cell.innerHTML = "";
    delete cell.dataset.deskId;

    if (desk) {
      const isAssignable = desk.is_assignable !== false;
      const isWalkway = (desk.department || "").toLowerCase() === "walkway";
      const fill = desk.fill_color || desk.department_color || "";

      cell.classList.add("has-desk");
      cell.classList.toggle("non-assignable", !isAssignable);
      cell.classList.toggle("blocked", desk.status === "blocked");
      cell.classList.toggle("occupied", desk.status === "occupied");
      cell.classList.toggle("free", desk.status === "free" && isAssignable);
      cell.classList.toggle("walkway", isWalkway);
      cell.dataset.deskId = desk.identifier;

      if (desk.status !== "blocked" && fill) {
        cell.style.background = fill;
      }

      if (!isWalkway) {
        const pill = isAssignable
          ? `<div class="status-pill status-${desk.status || "free"}">${statusLabel(desk)}</div>`
          : "";
        cell.innerHTML = `
          <div class="desk-label">${desk.label}</div>
          ${pill}
        `;
      }
      cell.title = `${desk.label} — ${desk.department}`;
    } else {
      cell.classList.add("empty-cell-state");
      cell.innerHTML = '<span class="empty-cell">Empty</span>';
      cell.title = "";
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
          if (suppressNextClick) {
            suppressNextClick = false;
            return;
          }
          if (event.shiftKey && lastSelectedKey) {
            const { row: lastRow, column: lastColumn } = parseKey(lastSelectedKey);
            selectRange(lastRow, lastColumn, row, column);
            handleSelectionChange(key);
            return;
          }
          if (event.metaKey || event.ctrlKey) {
            toggleCellSelection(key);
            handleSelectionChange(key);
            return;
          }
          if (selectedCells.size > 1 && !selectedCells.has(key)) {
            selectedCells.clear();
            selectedCells.add(key);
            handleSelectionChange(key);
            return;
          }
          toggleCellSelection(key);
          handleSelectionChange(key);
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

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const cell = getCellFromEvent(event);
    const parsed = parseCellElement(cell);
    if (!parsed) {
      return;
    }
    if (selectionDragState.pointerId !== null && selectionDragState.pointerId !== event.pointerId) {
      releaseSelectionPointer(selectionDragState.pointerId);
    }
    selectionDragState.pointerId = event.pointerId;
    selectionDragState.startRow = parsed.row;
    selectionDragState.startColumn = parsed.column;
    selectionDragState.lastRow = parsed.row;
    selectionDragState.lastColumn = parsed.column;
    selectionDragState.startX = event.clientX;
    selectionDragState.startY = event.clientY;
    selectionDragState.hasMoved = false;
    try {
      if (typeof canvas.setPointerCapture === "function") {
        canvas.setPointerCapture(event.pointerId);
      }
    } catch (error) {
      // ignore browsers without pointer capture support
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (selectionDragState.pointerId === null || event.pointerId !== selectionDragState.pointerId) {
      return;
    }
    if (typeof event.buttons === "number" && (event.buttons & 1) === 0) {
      endSelectionDrag(event, true);
      return;
    }
    const deltaX = event.clientX - selectionDragState.startX;
    const deltaY = event.clientY - selectionDragState.startY;
    if (!selectionDragState.hasMoved) {
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared < SELECTION_DRAG_THRESHOLD_SQUARED) {
        return;
      }
      selectionDragState.hasMoved = true;
    }
    const cell = getCellFromEvent(event);
    const parsed = parseCellElement(cell);
    if (!parsed) {
      return;
    }
    if (parsed.row === selectionDragState.lastRow && parsed.column === selectionDragState.lastColumn) {
      return;
    }
    selectionDragState.lastRow = parsed.row;
    selectionDragState.lastColumn = parsed.column;
    selectRange(selectionDragState.startRow, selectionDragState.startColumn, parsed.row, parsed.column);
    handleSelectionChange(parsed.key);
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
  });

  const cancelSelectionDrag = (event) => {
    endSelectionDrag(event, true);
  };

  canvas.addEventListener("pointerleave", cancelSelectionDrag);
  canvas.addEventListener("pointercancel", cancelSelectionDrag);
  canvas.addEventListener("pointerup", (event) => {
    endSelectionDrag(event, false);
  });

  function getSelectedDesks() {
    return [...selectedCells]
      .map((key) => deskByCell.get(key))
      .filter((desk) => Boolean(desk));
  }

  function getAssignableDesks() {
    return getSelectedDesks().filter((desk) => desk.is_assignable !== false);
  }

  function updateSelectionInfo() {
    if (selectedCells.size === 0) {
      selectionInfo.textContent = "No cells selected.";
    } else if (selectedCells.size === 1) {
      const { row, column } = parseKey([...selectedCells][0]);
      selectionInfo.textContent = `Editing cell r${String(row).padStart(2, "0")}c${String(column).padStart(2, "0")}`;
    } else {
      selectionInfo.textContent = `${selectedCells.size} cells selected.`;
    }

    if (!selectionList) {
      return;
    }

    selectionList.innerHTML = "";
    if (selectedCells.size === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const sortedKeys = [...selectedCells].map((key) => ({ key, ...parseKey(key) }));
    sortedKeys.sort((a, b) => (a.row - b.row !== 0 ? a.row - b.row : a.column - b.column));
    sortedKeys.forEach((item) => {
      const desk = deskByCell.get(item.key);
      const entry = document.createElement("li");
      entry.className = "selection-list-item";
      if (desk) {
        entry.textContent = `${desk.label} • ${statusLabel(desk)}`;
      } else {
        entry.textContent = `Empty cell r${String(item.row).padStart(2, "0")}c${String(item.column).padStart(2, "0")}`;
      }
      fragment.appendChild(entry);
    });
    selectionList.appendChild(fragment);
  }

  function syncFormsWithSelection() {
    clearFeedback("layout");
    clearFeedback("assignment");
    clearFeedback("block");
    if (layoutForm) {
      if (selectedCells.size !== 1) {
        layoutForm.reset();
      } else {
        const firstKey = Array.from(selectedCells)[0];
        const desk = deskByCell.get(firstKey);
        if (desk) {
          if (departmentInput) {
            departmentInput.value = String(desk.department_id || "");
          }
          if (labelInput) {
            labelInput.value = desk.label || "";
          }
          if (fillInput) {
            fillInput.value = desk.fill_color || "";
          }
          if (notesInput) {
            notesInput.value = desk.notes || "";
          }
        } else {
          layoutForm.reset();
        }
      }
    }
    updateActionAvailability();
  }

  function updateActionAvailability() {
    const desks = getSelectedDesks();
    const assignable = getAssignableDesks();
    const ignoredCount = selectedCells.size - desks.length;

    if (assignmentSelectionInfo) {
      if (assignable.length === 0) {
        assignmentSelectionInfo.textContent = selectedCells.size
          ? "Selected desks cannot accept assignments."
          : "Select at least one assignable desk.";
      } else {
        assignmentSelectionInfo.textContent = `${assignable.length} desk(s) ready for assignment.`;
      }
    }
    if (assignmentSubmit) {
      assignmentSubmit.disabled = assignable.length === 0;
    }

    if (blockSelectionInfo) {
      if (desks.length === 0) {
        blockSelectionInfo.textContent = "Select the desks you want to block.";
      } else if (ignoredCount > 0) {
        blockSelectionInfo.textContent = `${desks.length} desk(s) will be blocked. ${ignoredCount} empty cell(s) ignored.`;
      } else {
        blockSelectionInfo.textContent = `${desks.length} desk(s) will be blocked.`;
      }
    }
    if (blockSubmit) {
      blockSubmit.disabled = desks.length === 0;
    }
  }

  function selectedCellsPayload() {
    return [...selectedCells].map((key) => parseKey(key));
  }

  function setDefaultStart(form, input) {
    if (!form || !input) {
      return;
    }
    const value = form.dataset.defaultStart;
    if (value && !input.value) {
      input.value = value;
    }
  }

  function bindDurationToggle(select, endInput) {
    if (!select || !endInput) {
      return;
    }
    const handleChange = () => {
      const isPermanent = select.value === "permanent";
      endInput.disabled = isPermanent;
      if (isPermanent) {
        endInput.value = "";
      }
    };
    if (select.dataset.durationBound !== "true") {
      select.addEventListener("change", handleChange);
      select.dataset.durationBound = "true";
    }
    handleChange();
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
    syncFormsWithSelection();
    updateSelectionInfo();
  }

  if (layoutForm) {
    layoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (selectedCells.size === 0) {
        setFeedback("Select at least one cell before assigning.", "warning", "layout");
        return;
      }
      if (!departmentInput || !departmentInput.value) {
        setFeedback("Choose a department for the selected cells.", "warning", "layout");
        return;
      }
      const payload = {
        action: "assign",
        cells: selectedCellsPayload(),
        data: {
          department: parseInt(departmentInput.value, 10),
          label: labelInput ? labelInput.value.trim() : "",
          fill_color: fillInput ? fillInput.value.trim() : "",
          notes: notesInput ? notesInput.value.trim() : "",
        },
      };
      try {
        const result = await sendUpdate(payload);
        applyServerResult(result);
        setFeedback(result.message || "Cells updated.", "success", "layout");
      } catch (error) {
        setFeedback(error.message, "danger", "layout");
      }
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      if (selectedCells.size === 0) {
        setFeedback("Select the cells you want to clear.", "warning", "layout");
        return;
      }
      if (
        !window.confirm(
          "Remove desks from the selected cells? This will also delete related assignments.",
        )
      ) {
        return;
      }
      const payload = {
        action: "clear",
        cells: selectedCellsPayload(),
      };
      try {
        const result = await sendUpdate(payload);
        applyServerResult(result);
        if (layoutForm) {
          layoutForm.reset();
        }
        setFeedback(result.message || "Cells cleared.", "success", "layout");
      } catch (error) {
        setFeedback(error.message, "danger", "layout");
      }
    });
  }

  if (assignmentForm) {
    assignmentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const assignable = getAssignableDesks();
      if (assignable.length === 0) {
        setFeedback(
          "Select at least one assignable desk to create an assignment.",
          "warning",
          "assignment",
        );
        return;
      }
      if (!assignmentName) {
        return;
      }
      const assigneeName = assignmentName.value.trim();
      if (!assigneeName) {
        setFeedback("Enter an employee name before saving.", "warning", "assignment");
        assignmentName.focus();
        return;
      }
      const durationValue = assignmentDuration ? assignmentDuration.value : "temporary";
      const startValue = assignmentStart ? assignmentStart.value : "";
      const endValue =
        durationValue === "permanent" || !assignmentEnd ? "" : assignmentEnd.value;
      const payload = {
        action: "assignment",
        cells: selectedCellsPayload(),
        data: {
          assignee_name: assigneeName,
          assignment_type: assignmentType ? assignmentType.value : "desk",
          duration_choice: durationValue,
          start: startValue,
          end: endValue,
          note: assignmentNote ? assignmentNote.value.trim() : "",
          created_by: assignmentCreatedBy ? assignmentCreatedBy.value.trim() : "",
        },
      };
      try {
        const result = await sendUpdate(payload);
        applyServerResult(result);
        assignmentForm.reset();
        setDefaultStart(assignmentForm, assignmentStart);
        bindDurationToggle(assignmentDuration, assignmentEnd);
        setFeedback(result.message || "Assignment saved.", "success", "assignment");
      } catch (error) {
        setFeedback(error.message, "danger", "assignment");
      }
    });
  }

  if (blockForm) {
    blockForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const desks = getSelectedDesks();
      if (desks.length === 0) {
        setFeedback("Select at least one desk to block.", "warning", "block");
        return;
      }
      if (!blockName) {
        return;
      }
      const zoneName = blockName.value.trim();
      if (!zoneName) {
        setFeedback("Enter a name for this block-out zone.", "warning", "block");
        blockName.focus();
        return;
      }
      const blockDurationValue = blockDuration ? blockDuration.value : "temporary";
      const blockStartValue = blockStart ? blockStart.value : "";
      const blockEndValue =
        blockDurationValue === "permanent" || !blockEnd ? "" : blockEnd.value;
      const payload = {
        action: "block",
        cells: selectedCellsPayload(),
        data: {
          name: zoneName,
          duration_choice: blockDurationValue,
          start: blockStartValue,
          end: blockEndValue,
          reason: blockReason ? blockReason.value.trim() : "",
          created_by: blockCreatedBy ? blockCreatedBy.value.trim() : "",
        },
      };
      try {
        const result = await sendUpdate(payload);
        applyServerResult(result);
        blockForm.reset();
        setDefaultStart(blockForm, blockStart);
        bindDurationToggle(blockDuration, blockEnd);
        setFeedback(result.message || "Block-out zone saved.", "success", "block");
      } catch (error) {
        setFeedback(error.message, "danger", "block");
      }
    });
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.adminMode;
      if (mode && mode !== activeMode) {
        setActiveMode(mode);
      }
    });
  });

  buildGrid();
  updateSelectionInfo();
  setActiveMode(activeMode);
  setDefaultStart(assignmentForm, assignmentStart);
  setDefaultStart(blockForm, blockStart);
  bindDurationToggle(assignmentDuration, assignmentEnd);
  bindDurationToggle(blockDuration, blockEnd);
  updateActionAvailability();
})();
