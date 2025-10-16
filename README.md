# Window-Works Workspace Move Coordinator

A Django application for managing temporary desk moves while construction is underway. The public floor plan lets teammates look up their current seat, react to construction block-outs, and reserve alternate locations on their own. Facilities staff can adjust the map layout, override assignments, and schedule block-out zones without touching the database.

## Feature highlights

- **Interactive floor plan experience**
  - Responsive grid that supports right-click panning, smooth zoom-to-kiosk shortcuts, and accessible colour contrast for each desk.
  - Colour-coded departments and badges that distinguish free, occupied, kiosk, and blocked desks at a glance.
  - Desk detail modal summarises occupant, department, active construction zones, and contextual notes.
- **Employee self-service workflow**
  - Welcome modal verifies identity using last name + phone extension (matched against `media/employees.csv`) and stores the profile locally for quick return visits.
  - Real-time banner shows the employee's assignment, alerts them when their desk is blocked, and guides them to pick a new seat.
  - Reserving a free desk automatically ends any prior desk assignment for the day and confirms the new location instantly.
- **Operational awareness**
  - Live kiosk list highlights unassigned kiosks and jumps directly to their location on the map.
  - Alerts surface active construction zones, blocked desks, and work-from-home assignments so teammates know when action is required.
- **Administrative console** (staff login required)
  - Visual layout editor supports multi-cell selection to assign departments, override colours/notes, or clear unused cells.
  - Seat assignment tools create temporary or permanent desk/WFH assignments and mark who recorded the change.
  - Block-out zone scheduler records construction windows across multiple desks with start/end times, reasons, and permanence flags.
  - Dashboards summarise active assignments and block-outs, with one-click actions to end assignments or lift zones.
- **Data integration & stack**
  - Employee roster loaded from CSV (`First,Last,Extension`) so authentication works without adding a user model.
  - SQLite by default with WhiteNoise for static assets, making the project easy to host in a simple environment.

## Prerequisites

- Python 3.11+
- Virtual environment tooling (recommended)

## Quick start

Follow the commands below from the repository root to set up a local development environment:

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run database migrations
python manage.py migrate

# 4. Load the sample floor plan (optional but helpful for demoing)
python manage.py loaddata floorplan/fixtures/sample_floorplan.json

# 5. Load the reference production layout (matches the spreadsheet)
python manage.py loaddata floorplan/fixtures/floorplan_layout.json

# 6. Provide an employee roster for authentication
mkdir -p media
cat <<CSV > media/employees.csv
First,Last,Extension
Jordan,Smith,5551
Taylor,Nguyen,5562
CSV

# 7. Launch the development server
python manage.py runserver
```

Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) to explore the floor plan. The admin console is available at [/admin-console/](http://127.0.0.1:8000/admin-console/) and requires a logged-in staff or superuser account. If you need the Django admin site as well, create a superuser:

```bash
python manage.py createsuperuser
```

Then sign in at [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/).

## Using the application

### Floor plan (team member view)

1. **Identify yourself:** The welcome modal collects your last name and phone extension. Matching records return the full name and store it in local storage for next time.
2. **Review your status:** The sidebar banner shows your current assignment, duration, and any construction alerts. If your desk is blocked or you lack an active assignment, the UI prompts you to pick a new location.
3. **Inspect desks:** Left-click a desk to open a modal with occupant info, department details, kiosk flags, and block-out reasons. Right-click drag pans the view. Selecting a kiosk from the “Available kiosks” list centers the map on that location.
4. **Reserve a seat:** Click a desk marked **Free**, confirm the end time (defaults to end-of-day), and submit. The assignment updates instantly and any prior desk reservation is ended automatically.

### Administrative console

The admin console exposes richer tools for facilities staff:

- **Layout mode:** Paint a selection of cells with a department, optional custom label/fill colour, or clear unused cells. Updates are written to the database immediately.
- **Seat assignment mode:** Apply desk or WFH assignments (temporary or permanent), set start/end times, capture notes, and log who made the change.
- **Block zone mode:** Define construction zones across multiple desks with optional reasons and end dates. Active zones are listed with quick actions to remove them.
- **Activity panels:** Review current desk assignments and block-out zones, with buttons to end assignments or delete zones in one step.

### API endpoints

These JSON endpoints power the front-end interactions and can be reused for integrations:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/employee-auth/` | Validate last name + extension against the employee CSV. |
| `POST /api/assignment-info/` | Retrieve the latest assignment and alerts for an employee name. |
| `GET /api/desks/<identifier>/` | Fetch desk metadata, assignment, and block status. |
| `POST /api/desks/<identifier>/assign/` | Reserve a desk for the authenticated employee stored in session. |
| `POST /api/layout/update/` | Staff-only endpoint for layout edits, assignments, or block zone updates. |

## Customising data

- **Floor plan layout:** Edit `floorplan/fixtures/sample_floorplan.json` or use the admin console layout editor, then export updates with `python manage.py dumpdata floorplan --indent 2 > floorplan/fixtures/custom_floorplan.json`.
- **Departments:** Manage via the Django admin (`/admin/`) or fixtures to adjust names and colours.
- **Employee roster:** Replace `media/employees.csv` with your organisation’s roster. Columns must include `First`, `Last`, and `Extension`. The extension can include prefixes (e.g. `777-777-1234`) — only the last four digits are used for matching.

## Testing

Run the Django test suite to validate employee authentication helpers, desk payload logic, and view behaviour:

```bash
python manage.py test
```

## Notes

- The project favours SQLite and avoids Docker for quick demos. Configure environment-specific settings as needed for production.
- Authentication protects the admin console, but the self-service floor plan intentionally allows anyone with a matching last name + extension to reserve a seat.
- Placeholder or future features should continue using the copy pattern “This feature is still in development.” if you introduce new stubs.
