
# AGENTS.md

> Guidance for code-generation agents (e.g., Codex) working in this repository.

This repository contains a **Django** application named **Window‑Works** for coordinating temporary desk moves on an interactive floor plan. It uses **Django 5.x** and **WhiteNoise** for serving static assets.

---

## 1) Goals & Scope for Agents

- Implement features and fixes within the existing **`floorplan`** app.
- Follow the **commands** and **conventions** below so that code runs and tests pass.
- Prefer minimal, well‑scoped PRs with tests over broad refactors.
- Do **not** change database schemas casually; use migrations.
- Do **not** expose secrets; keep settings/environment variables out of VCS.

### Safe places to modify
- `floorplan/` (models, views, forms, urls, templates, static files)
- `floorplan/tests.py` (add unit tests)
- New files under `floorplan/` as needed (e.g., `services.py`, `selectors.py`)

### Avoid unless asked
- `workspace_manager/settings.py` (only adjust settings behind env flags)
- Migration files **by hand** (generate via management commands instead)
- Public API/URLs without updating docs and tests

---

## 2) Project Structure (high level)

- `manage.py` — Django entry point
- `workspace_manager/` — project settings and WSGI/ASGI
- `floorplan/` — main app
  - `models.py`, `views.py`, `forms.py`, `urls.py`, `admin.py`
  - `migrations/` — auto‑generated schema migrations
  - `fixtures/` — seed data (e.g., `floorplan_layout.json`, `sample_floorplan.json`)
  - `tests.py` — unit/integration tests
- `requirements.txt` — Python dependencies
- `README.md` — product overview and usage notes

If you add templates or static assets, place them conventionally, e.g.:
- `floorplan/templates/floorplan/*.html`
- `floorplan/static/floorplan/*`

---

## 3) Environment & Setup

### Requirements
- Python **3.11+** (recommended)
- Pip / venv

### Create a virtualenv & install deps
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix/macOS:
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

Dependencies (from `requirements.txt`):
- `Django==5.2.7`
- `whitenoise==6.6.0`

### Local environment variables
Create `.env` (or export in your shell) for anything sensitive. The default settings should work for local dev without extra secrets.

---

## 4) Database, Migrations & Seed Data

Use SQLite for local development unless otherwise configured.

```bash
# Create/update schema
python manage.py makemigrations
python manage.py migrate

# (Optional) Load example data
python manage.py loaddata floorplan/fixtures/floorplan_layout.json
python manage.py loaddata floorplan/fixtures/sample_floorplan.json
```

**Rules for agents**
- Never hand‑edit files in `floorplan/migrations/`. Use `makemigrations`.
- If changing models, add/adjust tests and run migrations.
- Keep fixtures valid JSON; prefer smaller, targeted fixtures for tests.

---

## 5) Running, Testing, Linting

### Run the app
```bash
python manage.py runserver 0.0.0.0:8000
```

### Run tests
```bash
python manage.py test -v 2
```

### Static files (WhiteNoise)
Collect static files before production deploys:
```bash
python manage.py collectstatic --noinput
```

*(If adding JS/CSS/images, place under `floorplan/static/`.)*

---

## 6) Coding Standards & Conventions

- Python style: PEP 8; prefer type hints for new/changed code.
- Organize imports (e.g., `isort` style) and keep functions small and focused.
- Name things clearly; avoid abbreviations and magic numbers.
- Views: keep thin by extracting complex logic to helpers (e.g., `services.py`).
- Tests: arrange‑act‑assert; prefer deterministic tests without network or time flakiness.

**Django conventions**
- Use class‑based views where appropriate.
- Keep validations in forms or `clean()` methods when user‑facing.
- For data access, consider thin selectors/services; keep models cohesive.

---

## 7) URLs, Permissions, and Security

- Update `floorplan/urls.py` when adding views or API endpoints.
- Validate and sanitize user input; never trust client data.
- Do not leak PII in logs.
- Use Django’s CSRF protection on state‑changing endpoints.
- Only broaden `ALLOWED_HOSTS` via environment variables for non‑local runs.

---

## 8) PR & Commit Guidance

- Keep PRs focused; describe the change, rationale, and testing steps.
- Update `README.md` when adding visible features.
- Include tests for bugs/features; keep coverage at least as high as before.
- Changelogs in commit messages should reference affected modules and behavior.

---

## 9) Useful Commands (copy‑paste)

```bash
# Install
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# DB
python manage.py makemigrations && python manage.py migrate

# Seed data
python manage.py loaddata floorplan/fixtures/floorplan_layout.json
python manage.py loaddata floorplan/fixtures/sample_floorplan.json

# Run
python manage.py runserver 0.0.0.0:8000

# Test
python manage.py test -v 2

# Static (prod)
python manage.py collectstatic --noinput
```

---

## 10) Where to Put New Code?

- New business logic: `floorplan/services.py` (create if missing).
- Read/query helpers: `floorplan/selectors.py` (create if missing).
- Templates: `floorplan/templates/floorplan/`
- Static assets: `floorplan/static/floorplan/`
- Form or serializer validation: keep near where it is used.

If in doubt, prefer small, explicit modules inside `floorplan/` over large files.

---

*Thanks for helping keep this codebase healthy and coherent.*
