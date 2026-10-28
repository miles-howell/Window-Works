"""Regenerate assets/readme/hero.svg from the real floor plan fixture.

Run from the repository root:  python assets/readme/source/build_hero.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "floorplan" / "fixtures" / "floorplan_layout.json"
OUTPUT = ROOT / "assets" / "readme" / "hero.svg"

# Frozen palette, taken from static/css/styles.css.
BACKGROUND = "#f7f9fb"
CARD = "#ffffff"
INK = "#1d2939"
MUTED = "#667085"
BORDER = "#e4e7ec"
ACCENT = "#2563eb"
FREE = "#039855"
OCCUPIED = "#f79009"
UNUSED_CELL = "#eaecf0"

SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

MAP_X, MAP_Y = 600, 64
PITCH, CELL = 18, 15
CALLOUT_DESK = "enrollment-r13c10"
OCCUPIED_DESKS = {"marketing-r02c08", "marketing-r02c09", "member-services-r01c17", "finance-r02c27", "enrollment-r13c08", "it-r13c19"}


def load_cells() -> list[dict]:
    records = json.loads(FIXTURE.read_text())
    departments = {r["pk"]: r["fields"] for r in records if r["model"] == "floorplan.department"}
    cells = []
    for record in records:
        if record["model"] != "floorplan.desk":
            continue
        desk = record["fields"]
        department = departments[desk["department"]]["name"]
        color = desk["fill_color"] or departments[desk["department"]]["color"]
        unused = color.lower() == "#000000" or department in {"Utility/Resource", "Walkway"}
        cells.append(
            {
                "id": desk["identifier"],
                "row": desk["row_index"],
                "col": desk["column_index"],
                "fill": UNUSED_CELL if unused else color,
                "seat": not unused,
            }
        )
    return cells


def cell_xy(row: int, col: int) -> tuple[int, int]:
    return MAP_X + (col - 1) * PITCH, MAP_Y + (row - 1) * PITCH


def build() -> str:
    cells = load_cells()
    rects = []
    for cell in sorted(cells, key=lambda c: (c["row"], c["col"])):
        x, y = cell_xy(cell["row"], cell["col"])
        rects.append(f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="3" fill="{cell["fill"]}"/>')
        if cell["id"] in OCCUPIED_DESKS:
            rects.append(f'<circle cx="{x + CELL / 2}" cy="{y + CELL / 2}" r="3.5" fill="{OCCUPIED}" stroke="#fff" stroke-width="1.5"/>')

    callout = next(c for c in cells if c["id"] == CALLOUT_DESK)
    cx, cy = cell_xy(callout["row"], callout["col"])
    max_row = max(c["row"] for c in cells)
    map_bottom = MAP_Y + max_row * PITCH
    label_y = map_bottom + 30

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="440" viewBox="0 0 1200 440" role="img" aria-labelledby="title desc">
  <title id="title">Window-Works</title>
  <desc id="desc">Window-Works, a Django floor plan tracker. Beside the title is the real 13 by 30 office layout from the project fixture, coloured by department, with desk enrollment-r13c10 highlighted as free to reserve.</desc>

  <rect width="1200" height="440" rx="24" fill="{BACKGROUND}"/>
  <rect x="0.5" y="0.5" width="1199" height="439" rx="24" fill="none" stroke="{BORDER}"/>

  <g id="title-block" font-family="{SANS}">
    <text x="56" y="96" font-family="{MONO}" font-size="18" letter-spacing="1.5" fill="{MUTED}">DJANGO · OFFICE FLOOR PLAN</text>
    <text x="54" y="170" font-size="62" font-weight="800" letter-spacing="-1.5" fill="{INK}">Window-Works</text>
    <text x="56" y="226" font-size="28" font-weight="600" fill="{INK}">Who sits where, on one</text>
    <text x="56" y="262" font-size="28" font-weight="600" fill="{INK}">colour-coded floor plan.</text>
    <text x="56" y="314" font-size="20" fill="{MUTED}">Reserve a free desk with just your name.</text>
    <text x="56" y="342" font-size="20" fill="{MUTED}">Staff repaint the layout in the browser.</text>
    <g transform="translate(56 372)" font-size="18" font-weight="700">
      <rect width="84" height="30" rx="15" fill="#e7f6ee"/>
      <circle cx="18" cy="15" r="4" fill="{FREE}"/>
      <text x="30" y="21" fill="{FREE}">FREE</text>
      <rect x="96" width="132" height="30" rx="15" fill="#fef0db"/>
      <circle cx="114" cy="15" r="4" fill="{OCCUPIED}"/>
      <text x="126" y="21" fill="#b54708">OCCUPIED</text>
    </g>
  </g>

  <g id="floor-plan">
    {chr(10).join('    ' + r for r in rects).strip()}
  </g>

  <g id="callout" font-family="{SANS}">
    <rect x="{cx - 4}" y="{cy - 4}" width="{CELL + 8}" height="{CELL + 8}" rx="6" fill="none" stroke="{ACCENT}" stroke-width="3"/>
    <path d="M{cx + CELL / 2} {cy + CELL + 4} V{label_y - 4}" stroke="{ACCENT}" stroke-width="2"/>
    <g transform="translate({cx - 130} {label_y})">
      <rect width="444" height="52" rx="12" fill="{CARD}" stroke="{BORDER}"/>
      <text x="18" y="33" font-family="{MONO}" font-size="20" fill="{INK}">{CALLOUT_DESK}</text>
      <rect x="238" y="11" width="78" height="30" rx="15" fill="#e7f6ee"/>
      <circle cx="254" cy="26" r="4" fill="{FREE}"/>
      <text x="265" y="32" font-size="18" font-weight="700" fill="{FREE}">FREE</text>
      <text x="330" y="33" font-size="18" font-weight="700" fill="{ACCENT}">Reserve →</text>
    </g>
  </g>
</svg>
"""


if __name__ == "__main__":
    OUTPUT.write_text(build())
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
