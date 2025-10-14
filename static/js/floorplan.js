(function () {
  const deskDataElement = document.getElementById("desk-data");
  if (!deskDataElement) {
    return;
  }

  const desks = JSON.parse(deskDataElement.textContent || "[]");
  const deskMap = new Map();
  desks.forEach((desk) => deskMap.set(desk.identifier, desk));

  const floorplanCanvas = document.getElementById("floorplan-canvas");
  const nameModal = document.getElementById("name-modal");
  const deskModal = document.getElementById("desk-modal");
  const deskModalContent = document.getElementById("desk-modal-content");
  const deskModalClose = document.getElementById("desk-modal-close");
  const nameForm = document.getElementById("name-form");
  const nameInput = document.getElementById("employee-name");
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

  let currentUserName = localStorage.getItem("workspaceEmployeeName") || "";
  let highlightedDeskId = null;

  function showModal(modal) {
    modal.classList.remove("hidden");
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
    if (highlightedDeskId && deskMap.has(highlightedDeskId)) {
      const oldDesk = floorplanCanvas.querySelector(`[data-desk-id="${highlightedDeskId}"]`);
      if (oldDesk) {
        oldDesk.classList.remove("current-user");
      }
    }
    highlightedDeskId = identifier;
    if (identifier) {
      const newDesk = floorplanCanvas.querySelector(`[data-desk-id="${identifier}"]`);
      if (newDesk) {
        newDesk.classList.add("current-user");
      }
    }
  }

  function renderDeskElement(desk) {
    const element = document.createElement("div");
    element.className = `desk ${desk.status}`;
    element.style.left = desk.style.left;
    element.style.top = desk.style.top;
    element.style.width = desk.style.width;
    element.style.height = desk.style.height;
    const isAssignable = desk.is_assignable !== false;
    if (!isAssignable) {
      element.classList.add("non-assignable");
    }
    if (desk.status === "blocked") {
      element.style.background = "";
    } else {
      const fillColor = desk.fill_color || desk.department_color;
      element.style.background = fillColor;
    }
    element.dataset.deskId = desk.identifier;
    const statusLabel = desk.status === "free" ? "Free" : desk.status === "blocked" ? "Blocked" : "Occupied";
    element.innerHTML = `
      <div>${desk.label}</div>
      ${isAssignable ? `<div class="status-pill">${statusLabel}</div>` : ""}
    `;
    if (isAssignable) {
      element.addEventListener("click", () => {
        openDeskModal(desk.identifier);
      });
    } else {
      element.style.cursor = "default";
    }
    floorplanCanvas.appendChild(element);
    return element;
  }

  function refreshDeskElement(desk) {
    const element = floorplanCanvas.querySelector(`[data-desk-id="${desk.identifier}"]`);
    if (!element) {
      renderDeskElement(desk);
      return;
    }
    element.className = `desk ${desk.status}`;
    const isAssignable = desk.is_assignable !== false;
    element.classList.toggle("non-assignable", !isAssignable);
    if (desk.status === "blocked") {
      element.style.background = "";
    } else {
      const fillColor = desk.fill_color || desk.department_color;
      element.style.background = fillColor;
    }
    const statusLabel = desk.status === "free" ? "Free" : desk.status === "blocked" ? "Blocked" : "Occupied";
    element.innerHTML = `
      <div>${desk.label}</div>
      ${isAssignable ? `<div class="status-pill">${statusLabel}</div>` : ""}
    `;
  }

  function renderFloorplan() {
    floorplanCanvas.innerHTML = "";
    deskMap.forEach((desk) => {
      renderDeskElement(desk);
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
    deskModalContent.innerHTML = lines.join("");
  }

  function renderAssignModal(desk) {
    const safeName = currentUserName || "";
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
            refreshDeskElement(payload.desk);
          }
          return;
        }
        const result = await response.json();
        deskMap.set(result.desk.identifier, result.desk);
        refreshDeskElement(result.desk);
        currentUserName = nameValue;
        localStorage.setItem("workspaceEmployeeName", currentUserName);
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
      refreshDeskElement(data);
    } catch (error) {
      // ignore network errors for now
    }
  }

  async function loadAssignmentInfo() {
    if (!currentUserName) {
      setStatus("info", "Welcome!", "Enter your name to load your assignment details.");
      updateAssignmentDetails(null);
      return;
    }
    nameInput.value = currentUserName;
    const params = new URLSearchParams({ name: currentUserName });
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

  function initNameModal() {
    if (!currentUserName) {
      showModal(nameModal);
    }
    nameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = nameInput.value.trim();
      if (!value) {
        return;
      }
      currentUserName = value;
      localStorage.setItem("workspaceEmployeeName", currentUserName);
      hideModal(nameModal);
      loadAssignmentInfo();
    });

    changeNameButton.addEventListener("click", () => {
      nameInput.value = currentUserName;
      showModal(nameModal);
      nameInput.focus();
    });
  }

  deskModalClose.addEventListener("click", () => hideModal(deskModal));
  deskModal.addEventListener("click", (event) => {
    if (event.target === deskModal) {
      hideModal(deskModal);
    }
  });

  renderFloorplan();
  initNameModal();
  loadAssignmentInfo();
})();
