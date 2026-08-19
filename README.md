# Window-Works Floorplan Tracker

A Django application for keeping track of an interactive floor plan and who is sitting where. Teammates can look up their current seat and reserve a free desk for themselves. Administrators can adjust the map layout and override assignments without touching the database.

## Feature highlights

- **Interactive floor plan experience**
  - Responsive grid that supports right-click panning and accessible colour contrast for each desk.
  - Colour-coded departments and badges that distinguish free, occupied, and kiosk desks at a glance.
  - Desk detail modal summarises occupant, department, and contextual notes.
- **Self-service workflow**
  - Enter your name in the sidebar to look up your current assignment — no account or approval required.
  - Real-time banner shows your assignment and duration.
  - Reserving a free desk automatically ends any prior desk assignment for the day and confirms the new location instantly.
- **Administrative console** (staff login required)
  - Visual layout editor supports multi-cell selection to assign departments, override colours/notes, or clear unused cells.
  - Seat assignment tools create temporary or permanent desk/WFH assignments and mark who recorded the change.
  - Dashboard summarises active assignments, with one-click actions to end assignments.
- **Data integration & stack**
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

# 3. Create a .env file for Django settings (safe defaults shown)
cat <<'ENV' > .env
DJANGO_SECRET_KEY=change-me-in-production
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
ENV

# 4. Run database migrations
python manage.py migrate

# 5. Load the sample floor plan (optional but helpful for demoing)
python manage.py loaddata floorplan/fixtures/sample_floorplan.json

# 6. Load the reference production layout (matches the spreadsheet)
python manage.py loaddata floorplan/fixtures/floorplan_layout.json

# 7. Launch the development server
python manage.py runserver
```

Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) to explore the floor plan. The admin console is available at [/admin-console/](http://127.0.0.1:8000/admin-console/) and requires a logged-in staff or superuser account. If you need the Django admin site as well, create a superuser:

```bash
python manage.py createsuperuser
```

Then sign in at [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/).

### Environment configuration

Window-Works reads configuration from environment variables with the help of [`python-dotenv`](https://pypi.org/project/python-dotenv/), so values placed in `.env` are loaded before Django evaluates the settings module. The defaults currently live in [`workspace_manager/settings.py`](workspace_manager/settings.py) for local development—review those names and update your `.env` values when promoting to staging or production. In particular, replace `DJANGO_SECRET_KEY` and tune `DJANGO_ALLOWED_HOSTS`.

## Using the application

### Floor plan (everyday view)

1. **Enter your name:** Type your name into the sidebar to load your current assignment.
2. **Review your status:** The sidebar banner shows your current assignment and its duration. If you don't have an active assignment, the UI prompts you to pick a new location.
3. **Inspect desks:** Left-click a desk to open a modal with occupant info, department details, and notes. Right-click drag pans the view.
4. **Reserve a seat:** Click a desk marked **Free**, confirm your name, and submit. The assignment updates instantly and any prior desk reservation is ended automatically.

### Administrative console

The admin console exposes richer tools for administrators:

- **Layout mode:** Paint a selection of cells with a department, optional custom label/fill colour, or clear unused cells. Updates are written to the database immediately.
- **Seat assignment mode:** Apply desk or WFH assignments (temporary or permanent), set start/end times, capture notes, and log who made the change.
- **Activity panel:** Review current desk assignments, with a button to end an assignment.

### API endpoints

These JSON endpoints power the front-end interactions and can be reused for integrations:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/assignment-info/` | Retrieve the latest assignment for a given name. |
| `GET /api/desks/<identifier>/` | Fetch desk metadata and assignment status. |
| `POST /api/desks/<identifier>/assign/` | Reserve a free desk for a given name. |
| `POST /api/layout/update/` | Staff-only endpoint for layout edits or assignments. |

## Customising data

- **Floor plan layout:** Edit `floorplan/fixtures/sample_floorplan.json` or use the admin console layout editor, then export updates with `python manage.py dumpdata floorplan --indent 2 > floorplan/fixtures/custom_floorplan.json`.
- **Departments:** Manage via the Django admin (`/admin/`) or fixtures to adjust names and colours.

## Testing

Run the Django test suite to validate desk payload logic and view behaviour:

```bash
python manage.py test
```

## Notes

- The project favours SQLite and avoids Docker for quick demos. Configure environment-specific settings as needed for production.
- Authentication protects the admin console, but the self-service floor plan intentionally allows anyone to reserve a seat by name.
- Placeholder or future features should continue using the copy pattern "This feature is still in development." if you introduce new stubs.
