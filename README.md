# Window-Works Workspace Move Coordinator

A lightweight Django application for coordinating temporary workstation moves while construction is in progress. The main interface renders an interactive floor plan that allows teammates to self-select free seats, view current assignments, and receive alerts when their area is affected by a block-out zone. Administrators can override assignments, schedule construction zones, and set long-term desk assignments.

## Features

- **Interactive floor plan** rendered as a responsive map with color-coded departments and desk statuses (Free, Occupied, Blocked).
- **Employee self-service:** on page load a modal captures the employee name, then highlights the current assignment or alerts the user if action is required (e.g., seat blocked for construction). Clicking a free seat allows the employee to reserve it for the remainder of the day.
- **Desk insights:** selecting any desk shows department details, occupant information, and active block-out reasons.
- **Administrative console:** create or override assignments (temporary or permanent), schedule block-out zones with date ranges or permanent flags, end assignments early, and remove construction zones.
- **Sample data** representing departments, desks, existing assignments, and an active construction zone to demonstrate workflow.

## Prerequisites

- Python 3.11+
- Virtual environment tooling (recommended)

## Getting started

Follow the commands below from the repository root to set up a local development environment:

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run database migrations
python manage.py migrate

# 4. Load the sample floor plan (optional but recommended)
python manage.py loaddata floorplan/fixtures/sample_floorplan.json

# 5. Load the production seating layout (matches the reference spreadsheet)
python manage.py loaddata floorplan/fixtures/floorplan_layout.json

# 6. Launch the development server
python manage.py runserver
```

Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) to explore the floor plan. The admin console is available at [/admin-console/](http://127.0.0.1:8000/admin-console/). If you also want to use the Django admin site, create a superuser account:

```bash
python manage.py createsuperuser
```

Then sign in at [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/).

## Workflow overview

1. **Employee entry:** When the floor plan loads, a modal requests the employee’s name and stores it locally for convenience. The sidebar displays the current assignment, duration, and any construction alerts.
2. **Seat selection:** Free desks show a “Free” badge. Clicking one opens a modal where the employee confirms their name and reserves the seat for the rest of the day. The UI refreshes immediately.
3. **Desk details:** Selecting an occupied or blocked seat opens a modal describing who is assigned, department information, and any relevant notes or block-out reasons.
4. **Administrative management:** The admin console provides forms to set temporary or permanent assignments (including WFH designations) and to schedule block-out zones across multiple desks with custom time windows.

## Customising the floor plan

The initial layout is provided via `floorplan/fixtures/sample_floorplan.json`. To adapt the plan for production:

1. Update or add departments in the Django admin (`/admin/`) or directly via fixtures.
2. Adjust desks with new coordinates (`left_percentage`, `top_percentage`, `width_percentage`, `height_percentage`) to match the real floor plan image.
3. Optionally export updated data with `python manage.py dumpdata floorplan --indent 2 > floorplan/fixtures/custom_floorplan.json` for reuse.

## Running tests

The project currently relies on manual verification. Future enhancements may add automated tests for assignment workflows and block-out scheduling.

## Notes

- The application intentionally avoids Docker/Postgres for simplicity and runs on SQLite by default.
- Authentication is not yet enforced; any user can enter a name and reserve a free seat as requested.
- Features that require future enhancement should display “This feature is still in development.” If you add additional placeholders, follow the same pattern.
