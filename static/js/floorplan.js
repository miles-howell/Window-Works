(function () {
  const deskDataElement = document.getElementById("desk-data");
  const floorplanCanvas = document.getElementById("floorplan-canvas");
  if (!deskDataElement || !floorplanCanvas) {
    return;
  }

  const desks = JSON.parse(deskDataElement.textContent || "[]");
  const deskMap = new Map();
  desks.forEach((desk) => deskMap.set(desk.identifier, desk));

  const gridRows = parseInt(floorplanCanvas.dataset.rows || "13", 10);
  const gridColumns = parseInt(floorplanCanvas.dataset.columns || "30", 10);
  floorplanCanvas.style.setProperty("--grid-rows", String(gridRows));
  floorplanCanvas.style.setProperty("--grid-columns", String(gridColumns));

  const cellMap = new Map();

  const DEFAULT_TEXT_COLOR = "#0f172a";
  const LIGHT_TEXT_COLOR = "#ffffff";
  const WHITE_RGB = { r: 255, g: 255, b: 255 };
  const BLACK_RGB = { r: 0, g: 0, b: 0 };

  function clampChannel(value) {
    return Math.min(Math.max(Math.round(value), 0), 255);
  }

  function hexToRgb(hex) {
    if (!hex) {
      return null;
    }
    let normalized = hex.trim();
    if (!normalized) {
      return null;
    }
    if (normalized.startsWith("#")) {
      normalized = normalized.slice(1);
    }
    const rgbMatch = normalized.match(/^rgb\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      return {
        r: clampChannel(parseInt(rgbMatch[1], 10)),
        g: clampChannel(parseInt(rgbMatch[2], 10)),
        b: clampChannel(parseInt(rgbMatch[3], 10)),
      };
    }
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
      return null;
    }
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((char) => char + char)
        .join("");
    }
    const numericValue = parseInt(normalized, 16);
    return {
      r: (numericValue >> 16) & 255,
      g: (numericValue >> 8) & 255,
      b: numericValue & 255,
    };
  }

  function rgbToHex(rgb) {
    if (!rgb) {
      return "";
    }
    const toHex = (value) => clampChannel(value).toString(16).padStart(2, "0");
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
  }

  function srgbToLinear(value) {
    const channel = value <= 0 ? 0 : value >= 1 ? 1 : value;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(rgb) {
    if (!rgb) {
      return 0;
    }
    const r = srgbToLinear(rgb.r / 255);
    const g = srgbToLinear(rgb.g / 255);
    const b = srgbToLinear(rgb.b / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const DARK_TEXT_RGB = hexToRgb(DEFAULT_TEXT_COLOR);
  const LIGHT_TEXT_RGB = hexToRgb(LIGHT_TEXT_COLOR);
  const DARK_TEXT_LUMINANCE = relativeLuminance(DARK_TEXT_RGB);
  const LIGHT_TEXT_LUMINANCE = relativeLuminance(LIGHT_TEXT_RGB);

  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function mixRgb(source, target, amount) {
    const mix = Math.min(Math.max(amount, 0), 1);
    return {
      r: clampChannel(source.r + (target.r - source.r) * mix),
      g: clampChannel(source.g + (target.g - source.g) * mix),
      b: clampChannel(source.b + (target.b - source.b) * mix),
    };
  }

  function computeAccessibleColors(color) {
    const baseRgb = hexToRgb(color);
    if (!baseRgb) {
      return {
        background: color || "",
        textColor: DEFAULT_TEXT_COLOR,
        theme: "light",
      };
    }

    let textColor = DEFAULT_TEXT_COLOR;
    let textRgb = DARK_TEXT_RGB;
    let textLuminance = DARK_TEXT_LUMINANCE;
    const baseLuminance = relativeLuminance(baseRgb);
    let contrast = contrastRatio(baseLuminance, textLuminance);
    let mixTarget = WHITE_RGB;

    const contrastWithLight = contrastRatio(baseLuminance, LIGHT_TEXT_LUMINANCE);
    if (contrastWithLight > contrast) {
      textColor = LIGHT_TEXT_COLOR;
      textRgb = LIGHT_TEXT_RGB;
      textLuminance = LIGHT_TEXT_LUMINANCE;
      contrast = contrastWithLight;
      mixTarget = BLACK_RGB;
    }

    let adjustedRgb = baseRgb;

    if (contrast < 4.5) {
      const steps = 6;
      const increment = 0.12;
      for (let index = 1; index <= steps; index += 1) {
        adjustedRgb = mixRgb(baseRgb, mixTarget, increment * index);
        const adjustedLuminance = relativeLuminance(adjustedRgb);
        contrast = contrastRatio(adjustedLuminance, textLuminance);
        if (contrast >= 4.5) {
          break;
        }
      }

      if (contrast < 4.5) {
        const alternativeRgb = textColor === LIGHT_TEXT_COLOR ? DARK_TEXT_RGB : LIGHT_TEXT_RGB;
        const alternativeLuminance = textColor === LIGHT_TEXT_COLOR ? DARK_TEXT_LUMINANCE : LIGHT_TEXT_LUMINANCE;
        const alternativeContrast = contrastRatio(baseLuminance, alternativeLuminance);
        if (alternativeContrast > contrast) {
          textColor = textColor === LIGHT_TEXT_COLOR ? DEFAULT_TEXT_COLOR : LIGHT_TEXT_COLOR;
          textRgb = alternativeRgb;
          textLuminance = alternativeLuminance;
          adjustedRgb = baseRgb;
          contrast = alternativeContrast;
        }
      }
    }

    return {
      background: rgbToHex(adjustedRgb),
      textColor,
      theme: textColor === LIGHT_TEXT_COLOR ? "dark" : "light",
    };
  }

  function applyAccessibleCellStyles(cell, fillColor) {
    if (!cell) {
      return null;
    }
    if (!fillColor) {
      cell.style.removeProperty("--cell-background");
      cell.style.removeProperty("--cell-text-color");
      cell.style.background = "";
      cell.style.color = "";
      cell.removeAttribute("data-contrast");
      return null;
    }
    const accessible = computeAccessibleColors(fillColor);
    cell.style.setProperty("--cell-background", accessible.background);
    cell.style.setProperty("--cell-text-color", accessible.textColor);
    cell.style.background = accessible.background;
    cell.style.color = accessible.textColor;
    cell.dataset.contrast = accessible.theme;
    return accessible;
  }

  const nameModal = document.getElementById("name-modal");
  const deskModal = document.getElementById("desk-modal");
  const deskModalContent = document.getElementById("desk-modal-content");
  const deskModalClose = document.getElementById("desk-modal-close");
  const nameForm = document.getElementById("name-form");
  const lastNameInput = document.getElementById("employee-last-name");
  const extensionInput = document.getElementById("employee-extension");
  const nameFeedback = document.getElementById("name-feedback");
  const nameSubmitButton = nameForm ? nameForm.querySelector("button[type=\"submit\"]") : null;
  const changeNameButton = document.getElementById("change-name");
  const statusBanner = document.getElementById("user-status");
  const statusTitle = document.getElementById("status-title");
  const statusBody = document.getElementById("status-body");
  const assignmentDetails = document.getElementById("assignment-details");
  const detailEmployee = document.getElementById("detail-employee");
  const detailLocation = document.getElementById("detail-location");
  const detailDepartment = document.getElementById("detail-department");
  const detailDuration = document.getElementById("detail-duration");
  const alertList = document.getElementById("alert-list");

  const STORAGE_KEY = "workspaceEmployeeProfile";
  const LEGACY_KEY = "workspaceEmployeeName";

  function normalizeUserProfile(rawValue) {
    if (!rawValue) {
      return null;
    }
    let parsed = rawValue;
    if (typeof rawValue === "string") {
      try {
        parsed = JSON.parse(rawValue);
      } catch (error) {
        return null;
      }
    }
    const firstName = (parsed.firstName || parsed.first_name || "").trim();
    const lastName = (parsed.lastName || parsed.last_name || "").trim();
    let fullName = (parsed.fullName || parsed.full_name || "").trim();
    if (!fullName) {
      fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    }
    if (!fullName) {
      return null;
    }
    return {
      firstName,
      lastName,
      fullName,
    };
  }

  function readStoredUser() {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    const user = storedValue ? normalizeUserProfile(storedValue) : null;
    return user;
  }

  function setCurrentUser(user) {
    const normalized = normalizeUserProfile(user);
    if (!normalized) {
      currentUser = null;
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    currentUser = normalized;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  function getCurrentFullName() {
    return currentUser ? currentUser.fullName : "";
  }

  localStorage.removeItem(LEGACY_KEY);

  let currentUser = readStoredUser();
  let highlightedCellKey = null;

  function cellKey(row, column) {
    return `${row}-${column}`;
  }

  function showModal(modal, focusTarget) {
    modal.classList.remove("hidden");
    const target = focusTarget || modal.querySelector("input, button, [tabindex]");
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  function hideModal(modal) {
    modal.classList.add("hidden");
  }

  function setStatus(type, title, body) {
    statusBanner.classList.remove("warning", "danger", "success", "info");
    if (type) {
      statusBanner.classList.add(type);
    }
    statusTitle.textContent = title;
    statusBody.textContent = body;
  }

  function updateAssignmentDetails(assignment) {
    if (!assignment) {
      assignmentDetails.classList.add("hidden");
      alertList.classList.add("hidden");
      alertList.innerHTML = "";
      highlightDesk(null);
      return;
    }

    detailEmployee.textContent = assignment.assignee;
    if (assignment.assignment_type === "desk") {
      detailLocation.textContent = assignment.desk;
      detailDepartment.textContent = assignment.department || "";
    } else {
      detailLocation.textContent = "Work From Home";
      detailDepartment.textContent = "Remote";
    }
    detailDuration.textContent = assignment.duration;
    assignmentDetails.classList.remove("hidden");

    if (assignment.assignment_type === "desk") {
      highlightDesk(assignment.desk_identifier);
    } else {
      highlightDesk(null);
    }

    alertList.innerHTML = "";
    if (assignment.blocked_zones && assignment.blocked_zones.length) {
      assignment.blocked_zones.forEach((zone) => {
        const li = document.createElement("li");
        li.className = "alert-item";
        li.textContent = `${assignment.desk} is currently blocked because of ${zone}. Please choose a new location.`;
        alertList.appendChild(li);
      });
      alertList.classList.remove("hidden");
    } else {
      alertList.classList.add("hidden");
    }
  }

  function highlightDesk(identifier) {
    if (highlightedCellKey && cellMap.has(highlightedCellKey)) {
      const oldCell = cellMap.get(highlightedCellKey);
      if (oldCell) {
        oldCell.classList.remove("current-user");
      }
    }
    highlightedCellKey = null;
    if (!identifier) {
      return;
    }
    const desk = deskMap.get(identifier);
    if (!desk) {
      return;
    }
    const key = cellKey(desk.row, desk.column);
    const cell = cellMap.get(key);
    if (cell) {
      cell.classList.add("current-user");
      highlightedCellKey = key;
    }
  }

  function statusLabelForDesk(desk) {
    if (desk.status === "blocked") {
      return "Blocked";
    }
    if (desk.status === "occupied") {
      return "Occupied";
    }
    return "Free";
  }

  function updateCellForDesk(desk) {
    const key = cellKey(desk.row, desk.column);
    const cell = cellMap.get(key);
    if (!cell) {
      return;
    }

    const isAssignable = desk.is_assignable !== false;
    const isWalkway = (desk.department || "").toLowerCase() === "walkway";
    const fillColor = desk.fill_color || desk.department_color || "";

    cell.className = "grid-cell has-desk";
    cell.classList.toggle("non-assignable", !isAssignable);
    cell.classList.toggle("blocked", desk.status === "blocked");
    cell.classList.toggle("occupied", desk.status === "occupied");
    cell.classList.toggle("free", desk.status === "free" && isAssignable);
    cell.classList.toggle("walkway", isWalkway);
    cell.dataset.deskId = desk.identifier;

    if (desk.status === "blocked") {
      applyAccessibleCellStyles(cell, "");
    } else {
      applyAccessibleCellStyles(cell, fillColor);
    }

    const statusLabel = statusLabelForDesk(desk);
    const statusModifier = desk.status ? ` status-${desk.status}` : "";
    const details = [];
    if (!isWalkway) {
      details.push(`<div class="desk-label">${desk.label}</div>`);
      if (isAssignable) {
        details.push(`<div class="status-pill${statusModifier}">${statusLabel}</div>`);
      }
    }
    cell.innerHTML = details.join("");
    cell.title = `${desk.label} — ${desk.department}`;

    if (isAssignable) {
      cell.onclick = () => openDeskModal(desk.identifier);
      cell.style.cursor = "pointer";
    } else {
      cell.onclick = null;
      cell.style.cursor = "default";
    }
  }

  function renderFloorplan() {
    floorplanCanvas.innerHTML = "";
    cellMap.clear();
    for (let row = 1; row <= gridRows; row += 1) {
      for (let column = 1; column <= gridColumns; column += 1) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        floorplanCanvas.appendChild(cell);
        cellMap.set(cellKey(row, column), cell);
      }
    }
    deskMap.forEach((desk) => {
      updateCellForDesk(desk);
    });
  }

  function adjustLegendColors() {
    const swatches = document.querySelectorAll(".legend-swatch[data-color]");
    swatches.forEach((swatch) => {
      const colorValue = swatch.dataset.color;
      if (!colorValue) {
        return;
      }
      const accessible = computeAccessibleColors(colorValue);
      swatch.style.background = accessible.background;
      swatch.style.borderColor =
        accessible.theme === "dark"
          ? "rgba(255, 255, 255, 0.6)"
          : "rgba(15, 23, 42, 0.12)";
    });
  }

  function openDeskModal(identifier) {
    const desk = deskMap.get(identifier);
    if (!desk) {
      return;
    }
    if (desk.status === "free") {
      renderAssignModal(desk);
    } else {
      renderDeskDetailsModal(desk);
    }
    showModal(deskModal);
  }

  function renderDeskDetailsModal(desk) {
    const assignment = desk.assignment;
    const blockList = desk.block_zones || [];
    const lines = [];
    lines.push(`<h2>${desk.label}</h2>`);
    lines.push(`<p><strong>Department:</strong> ${desk.department}</p>`);
    if (desk.status === "blocked") {
      lines.push(`<p class="note-text">This desk is currently unavailable because of the following zones:</p>`);
      lines.push("<ul class=\"alert-list\">");
      blockList.forEach((zone) => {
        lines.push(`<li class="alert-item">${zone}</li>`);
      });
      lines.push("</ul>");
    }
    if (assignment) {
      lines.push(`<p><strong>Assigned to:</strong> ${assignment.assignee}</p>`);
      lines.push(`<p><strong>Duration:</strong> ${assignment.duration}</p>`);
      if (assignment.note) {
        lines.push(`<p class="note-text">${assignment.note}</p>`);
      }
    } else if (desk.status !== "blocked") {
      lines.push("<p>This desk is currently unassigned.</p>");
    }
    if (desk.notes) {
      lines.push(`<p class="note-text">${desk.notes}</p>`);
    }
    deskModalContent.innerHTML = lines.join("");
  }

  function renderAssignModal(desk) {
    const safeName = getCurrentFullName();
    deskModalContent.innerHTML = `
      <h2>Reserve ${desk.label}</h2>
      <p>Free seat in ${desk.department}. Enter your name to reserve this desk until the end of the day.</p>
      <form id="assign-form" class="form-grid">
        <div>
          <label for="assign-name">Employee name</label>
          <input type="text" id="assign-name" name="assignee_name" required value="${safeName}" />
        </div>
        <div class="modal-actions">
          <button type="submit" class="button primary">Reserve seat</button>
        </div>
      </form>
      <div id="assign-error" class="alert-item hidden"></div>
    `;

    const assignForm = document.getElementById("assign-form");
    const assignNameInput = document.getElementById("assign-name");
    const assignError = document.getElementById("assign-error");
    assignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nameValue = assignNameInput.value.trim();
      if (!nameValue) {
        assignError.textContent = "Please provide a name.";
        assignError.classList.remove("hidden");
        return;
      }
      assignError.classList.add("hidden");
      try {
        const response = await fetch(`/api/desks/${desk.identifier}/assign/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": window.getCsrfToken(),
          },
          body: new URLSearchParams({ assignee_name: nameValue }).toString(),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: "Unable to reserve seat." }));
          assignError.textContent = payload.error || "Unable to reserve seat.";
          assignError.classList.remove("hidden");
          if (payload.desk) {
            deskMap.set(payload.desk.identifier, payload.desk);
            updateCellForDesk(payload.desk);
          }
          return;
        }
        const result = await response.json();
        deskMap.set(result.desk.identifier, result.desk);
        updateCellForDesk(result.desk);
        if (currentUser) {
          setCurrentUser({
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            fullName: nameValue,
          });
        } else {
          setCurrentUser({ fullName: nameValue });
        }
        hideModal(deskModal);
        await loadAssignmentInfo();
      } catch (error) {
        assignError.textContent = "Network error. Please try again.";
        assignError.classList.remove("hidden");
      }
    });
  }

  async function refreshDesk(identifier) {
    try {
      const response = await fetch(`/api/desks/${identifier}/`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      deskMap.set(data.identifier, data);
      updateCellForDesk(data);
    } catch (error) {
      // ignore network errors
    }
  }

  async function loadAssignmentInfo() {
    const fullName = getCurrentFullName();
    if (!fullName) {
      setStatus(
        "info",
        "Welcome!",
        "Enter your last name and extension to load your assignment details.",
      );
      updateAssignmentDetails(null);
      return;
    }
    if (lastNameInput && currentUser) {
      lastNameInput.value = currentUser.lastName;
    }
    const params = new URLSearchParams({ name: fullName });
    try {
      const response = await fetch("/api/assignment-info/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": window.getCsrfToken(),
        },
        body: params.toString(),
      });
      if (!response.ok) {
        setStatus("danger", "Something went wrong", "We could not load your assignment right now. Please try again later.");
        updateAssignmentDetails(null);
        return;
      }
      const data = await response.json();
      if (data.assignment && data.assignment.desk_identifier) {
        await refreshDesk(data.assignment.desk_identifier);
      }
      if (data.needs_action) {
        setStatus("warning", "Action needed", data.message);
      } else {
        setStatus("success", "You're all set", data.message || "");
      }
      updateAssignmentDetails(data.assignment || null);
    } catch (error) {
      setStatus("danger", "Network error", "We could not load your assignment right now. Please try again later.");
      updateAssignmentDetails(null);
    }
  }

  function updateNameFeedback(message) {
    if (!nameFeedback) {
      return;
    }
    if (message) {
      nameFeedback.textContent = message;
      nameFeedback.classList.remove("hidden");
    } else {
      nameFeedback.textContent = "";
      nameFeedback.classList.add("hidden");
    }
  }

  function setVerificationBusy(isBusy) {
    if (!nameSubmitButton) {
      return;
    }
    if (!nameSubmitButton.dataset.originalLabel) {
      nameSubmitButton.dataset.originalLabel = nameSubmitButton.textContent || "";
    }
    if (isBusy) {
      nameSubmitButton.disabled = true;
      nameSubmitButton.textContent = "Verifying…";
    } else {
      nameSubmitButton.disabled = false;
      nameSubmitButton.textContent = nameSubmitButton.dataset.originalLabel || "Verify details";
    }
  }

  function initNameModal() {
    if (!nameModal || !nameForm || !lastNameInput || !extensionInput) {
      return;
    }
    if (!getCurrentFullName()) {
      showModal(nameModal, lastNameInput);
    } else if (currentUser) {
      lastNameInput.value = currentUser.lastName;
    }

    nameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const lastNameValue = lastNameInput.value.trim();
      const extensionValue = extensionInput.value.trim();
      if (!lastNameValue) {
        updateNameFeedback("Please enter your last name.");
        lastNameInput.focus();
        return;
      }
      if (!extensionValue) {
        updateNameFeedback("Please enter the last four digits of your extension.");
        extensionInput.focus();
        return;
      }
      updateNameFeedback("");
      setVerificationBusy(true);
      setStatus("info", "Verifying details", "Hang tight while we match your information.");
      try {
        const response = await fetch("/api/employee-auth/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": window.getCsrfToken(),
          },
          body: new URLSearchParams({ last_name: lastNameValue, extension: extensionValue }).toString(),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload.error || "We couldn't verify those details. Please try again.";
          updateNameFeedback(message);
          setStatus("danger", "Verification failed", message);
          return;
        }
        const data = await response.json();
        setCurrentUser({
          firstName: data.first_name,
          lastName: data.last_name,
          fullName: data.full_name,
        });
        setStatus(
          "success",
          "Verification complete",
          `Welcome back, ${getCurrentFullName()}. Loading your assignment details now.`,
        );
        updateNameFeedback("");
        extensionInput.value = "";
        hideModal(nameModal);
        await loadAssignmentInfo();
      } catch (error) {
        updateNameFeedback("Network error. Please try again.");
        setStatus("danger", "Network error", "We couldn't verify your details. Please try again.");
      } finally {
        setVerificationBusy(false);
      }
    });

    if (changeNameButton) {
      changeNameButton.addEventListener("click", () => {
        if (currentUser) {
          lastNameInput.value = currentUser.lastName;
        }
        extensionInput.value = "";
        updateNameFeedback("");
        showModal(nameModal, lastNameInput);
      });
    }
  }

  deskModalClose.addEventListener("click", () => hideModal(deskModal));
  deskModal.addEventListener("click", (event) => {
    if (event.target === deskModal) {
      hideModal(deskModal);
    }
  });

  renderFloorplan();
  adjustLegendColors();
  initNameModal();
  loadAssignmentInfo();
})();
