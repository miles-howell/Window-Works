// In-browser demo of the Window-Works floor plan. Nothing here talks to a server.
(function () {
  "use strict";

  const layout = window.WINDOW_WORKS_LAYOUT;
  const grid = document.getElementById("floor-grid");
  if (!layout || !grid) return;

  const NAME_KEY = "window-works-demo-name";
  const SEEDED_OCCUPANTS = {
    "marketing-r01c13": ["Quinn Rossi", "Open ended"],
    "marketing-r02c08": ["Avery Chen", "Until 5:00 PM"],
    "marketing-r02c09": ["Sam Patel", "Until 5:00 PM"],
    "marketing-r02c10": ["Riley Okafor", "Open ended"],
    "member-services-r01c17": ["Morgan Diaz", "Until 5:00 PM"],
    "member-services-r02c17": ["Jamie Novak", "Open ended"],
    "member-services-r03c19": ["Casey Nguyen", "Until 5:00 PM"],
    "finance-r01c21": ["Taylor Brooks", "Open ended"],
    "finance-r01c23": ["Alex Moreau", "Until 5:00 PM"],
    "finance-r02c24": ["Jordan Ellis", "Open ended"],
    "finance-r03c22": ["Robin Hayes", "Until 5:00 PM"],
    "medical-r01c26": ["Dr. Lee Park", "Open ended"],
    "finance-r08c28": ["Drew Kim", "Until 5:00 PM"],
    "enrollment-r13c08": ["Harper Singh", "Open ended"],
    "it-r12c19": ["Kai Andersen", "Until 5:00 PM"],
  };

  const state = { selected: null, filter: null, occupants: {} };
  const deskById = {};
  const buttons = {};

  const el = (id) => document.getElementById(id);
  const panel = {
    empty: el("panel-empty"),
    detail: el("panel-detail"),
    swatch: el("panel-swatch"),
    dept: el("panel-dept"),
    label: el("panel-label"),
    id: el("panel-id"),
    status: el("panel-status"),
    assignee: el("panel-assignee"),
    duration: el("panel-duration"),
    form: el("reserve-form"),
    name: el("reserve-name"),
    note: el("panel-note"),
  };

  function readSavedName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (error) { return ""; }
  }
  function saveName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (error) { /* storage unavailable */ }
  }

  function deskTitle(desk) {
    return desk.label && desk.label !== "Empty" ? desk.label : "Desk " + desk.row + "·" + desk.col;
  }

  function render() {
    grid.style.setProperty("--cols", layout.cols);
    const fragment = document.createDocumentFragment();
    layout.desks.forEach((desk) => {
      deskById[desk.id] = desk;
      let node;
      if (desk.seat) {
        node = document.createElement("button");
        node.type = "button";
        node.className = "desk";
        node.style.setProperty("--fill", desk.fill);
        node.dataset.id = desk.id;
        node.addEventListener("click", () => select(desk.id));
        buttons[desk.id] = node;
      } else {
        node = document.createElement("div");
        node.className = "cell-blank";
        const hasLabel = desk.label && desk.label !== "Empty";
        if (hasLabel) {
          node.classList.add("has-label");
          node.title = desk.label;
        }
        node.setAttribute("aria-hidden", "true");
      }
      node.style.gridRow = desk.row;
      node.style.gridColumn = desk.col;
      fragment.appendChild(node);
    });
    grid.appendChild(fragment);
    Object.entries(SEEDED_OCCUPANTS).forEach(([id, [name, duration]]) => {
      if (deskById[id] && deskById[id].seat) state.occupants[id] = { name, duration, mine: false };
    });
    layout.desks.filter((desk) => desk.seat).forEach(refreshDesk);
    renderLegend();
    refreshStats();
  }

  function refreshDesk(desk) {
    const button = buttons[desk.id];
    const occupant = state.occupants[desk.id];
    button.classList.toggle("is-occupied", Boolean(occupant) && !occupant.mine);
    button.classList.toggle("is-mine", Boolean(occupant && occupant.mine));
    button.classList.toggle("is-selected", state.selected === desk.id);
    button.classList.toggle("is-highlighted", state.filter === desk.department);
    const status = occupant ? "occupied by " + occupant.name : "free";
    button.setAttribute("aria-label", deskTitle(desk) + ", " + desk.department + ", " + status);
    button.title = deskTitle(desk) + " · " + desk.department + (occupant ? " · " + occupant.name : " · Free");
  }

  function refreshStats() {
    const seats = layout.desks.filter((desk) => desk.seat).length;
    const occupied = Object.keys(state.occupants).length;
    el("stat-free").textContent = seats - occupied;
    el("stat-occupied").textContent = occupied;
  }

  function renderLegend() {
    const legend = el("legend");
    layout.departments.forEach((department) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = '<span class="swatch"></span>';
      button.firstChild.style.background = department.color;
      button.append(department.name);
      button.addEventListener("click", () => {
        state.filter = state.filter === department.name ? null : department.name;
        legend.querySelectorAll("button").forEach((other) => other.setAttribute("aria-pressed", String(other === button && Boolean(state.filter))));
        grid.classList.toggle("is-filtering", Boolean(state.filter));
        layout.desks.filter((desk) => desk.seat).forEach(refreshDesk);
      });
      item.appendChild(button);
      legend.appendChild(item);
    });
  }

  function select(id) {
    const previous = state.selected;
    state.selected = id;
    if (previous && buttons[previous]) refreshDesk(deskById[previous]);
    refreshDesk(deskById[id]);
    showPanel(deskById[id]);
  }

  function showPanel(desk, note) {
    const occupant = state.occupants[desk.id];
    panel.empty.hidden = true;
    panel.detail.hidden = false;
    panel.swatch.style.background = desk.fill;
    panel.dept.textContent = desk.department;
    panel.label.textContent = deskTitle(desk);
    panel.id.textContent = desk.id;
    panel.status.textContent = occupant ? "Occupied" : "Free";
    panel.status.className = occupant ? "status-occupied" : "status-free";
    panel.assignee.textContent = occupant ? occupant.name + (occupant.mine ? " (you)" : "") : "Nobody yet";
    panel.duration.textContent = occupant ? occupant.duration : "Available";
    panel.form.hidden = Boolean(occupant);
    panel.note.hidden = !note;
    panel.note.textContent = note || "";
    if (!occupant && !panel.name.value) panel.name.value = readSavedName();
  }

  panel.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = panel.name.value.trim().replace(/\s+/g, " ");
    const desk = deskById[state.selected];
    if (!name || !desk || state.occupants[desk.id]) return;

    let released = null;
    Object.entries(state.occupants).forEach(([id, occupant]) => {
      if (occupant.name.toLowerCase() === name.toLowerCase()) {
        released = deskById[id];
        delete state.occupants[id];
        refreshDesk(released);
      }
    });

    state.occupants[desk.id] = { name, duration: "Until end of day", mine: true };
    saveName(name);
    refreshDesk(desk);
    refreshStats();
    const button = buttons[desk.id];
    button.classList.remove("just-booked");
    void button.offsetWidth;
    button.classList.add("just-booked");

    const note = released
      ? "Reserved! Your earlier desk (" + deskTitle(released) + ", " + released.department + ") was released automatically."
      : "Reserved! Try booking another desk under the same name and watch this one free up.";
    showPanel(desk, note);
  });

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const source = document.getElementById(button.dataset.copyTarget);
      const text = source.textContent.split("\n").filter((line) => !line.startsWith("#")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied!";
      } catch (error) {
        button.textContent = "Press Ctrl+C";
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setTimeout(() => { button.textContent = "Copy"; }, 1800);
    });
  });

  render();
})();
