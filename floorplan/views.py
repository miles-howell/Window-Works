from __future__ import annotations

import json
from datetime import datetime, time, timedelta

from django.contrib import messages
from django.db import models, transaction
from django.http import JsonResponse, QueryDict
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.decorators import login_required

from .employees import match_employee, normalize_extension_input
from .forms import AssignmentForm, BlockOutZoneForm
from .layout import GRID_COLUMNS, GRID_ROWS, cell_identifier, grid_to_percentages
from .models import Assignment, BlockOutZone, Department, Desk


SESSION_EMPLOYEE_PROFILE_KEY = "floorplan_employee_profile"


def _localized_datetime(value):
    if not value:
        return None
    return timezone.localtime(value)


def _datetime_input_value(value):
    localized = _localized_datetime(value)
    if not localized:
        return ""
    return localized.strftime("%Y-%m-%dT%H:%M")


def _datetime_display_value(value):
    localized = _localized_datetime(value)
    if not localized:
        return ""
    return localized.strftime("%b %d, %Y %I:%M %p")


def _block_zone_duration_display(zone: BlockOutZone) -> str:
    if zone.is_permanent:
        return "Permanent block"
    end_display = _datetime_display_value(zone.end)
    if end_display:
        return f"Until {end_display}"
    return "Open ended"


def _serialize_assignment(assignment: Assignment, now=None) -> dict | None:
    if not assignment:
        return None
    now = now or timezone.now()
    data = {
        "assignee": assignment.assignee_name,
        "assignment_type": assignment.assignment_type,
        "start": timezone.localtime(assignment.start).isoformat(),
        "duration": assignment.duration_display,
        "note": assignment.note,
    }
    if assignment.assignment_type == Assignment.TYPE_DESK and assignment.desk:
        data.update(
            {
                "desk": assignment.desk.label,
                "desk_identifier": assignment.desk.identifier,
                "department": assignment.desk.department.name,
            }
        )
        data["blocked_zones"] = [
            zone.name
            for zone in assignment.desk.block_zones.all()
            if zone.is_active(now)
        ]
    return data


def _is_kiosk_desk(desk: Desk) -> bool:
    label = (desk.label or "").strip().casefold()
    notes = (desk.notes or "").strip().casefold()
    return "kiosk" in label or "kiosk" in notes


def _desk_payload(desk: Desk, now=None) -> dict:
    now = now or timezone.now()
    active_assignment = desk.active_assignment(now)
    block_zones = [zone for zone in desk.block_zones.all() if zone.is_active(now)]
    status = "free"
    if active_assignment:
        status = "occupied"
    if block_zones:
        status = "blocked"
    is_kiosk = _is_kiosk_desk(desk)
    is_assignable = is_kiosk or desk.department.name not in {"Utility/Resource", "Walkway"}
    left, top, width, height = grid_to_percentages(
        desk.row_index,
        desk.column_index,
        desk.row_span,
        desk.column_span,
    )
    return {
        "identifier": desk.identifier,
        "label": desk.label,
        "department": desk.department.name,
        "department_color": desk.department.color,
        "fill_color": desk.fill_color or desk.department.color,
        "notes": desk.notes,
        "is_assignable": is_assignable,
        "is_kiosk": is_kiosk,
        "row": desk.row_index,
        "column": desk.column_index,
        "row_span": desk.row_span,
        "column_span": desk.column_span,
        "style": {
            "left": f"{left}%",
            "top": f"{top}%",
            "width": f"{width}%",
            "height": f"{height}%",
        },
        "status": status,
        "is_blocked": bool(block_zones),
        "block_zones": [zone.name for zone in block_zones],
        "assignment": _serialize_assignment(active_assignment, now),
        "department_id": desk.department_id,
    }


def _first_form_error(form, default_message: str) -> str:
    if not form.errors:
        return default_message
    for errors in form.errors.values():
        if errors:
            return errors[0]
    return default_message


@ensure_csrf_cookie
def index(request):
    now = timezone.now()
    desks = (
        Desk.objects.select_related("department")
        .prefetch_related("block_zones", "assignments")
        .all()
    )
    desk_payloads = [_desk_payload(desk, now) for desk in desks]
    departments = Department.objects.all()
    context = {
        "desks": json.dumps(desk_payloads),
        "departments": departments,
        "now_iso": timezone.localtime(now).isoformat(),
        "grid_rows": GRID_ROWS,
        "grid_columns": GRID_COLUMNS,
    }
    return render(request, "floorplan/index.html", context)


@require_POST
def assignment_info(request):
    name = request.POST.get("name", "").strip()
    if not name:
        return JsonResponse({"error": "Name is required."}, status=400)

    now = timezone.now()
    assignments = (
        Assignment.objects.select_related("desk", "desk__department")
        .filter(assignee_name__iexact=name)
        .order_by("-start")
    )
    active_assignment = next((a for a in assignments if a.is_active(now)), None)

    response = {
        "name": name,
        "assignment": _serialize_assignment(active_assignment, now),
        "needs_action": False,
        "message": "",
    }

    if active_assignment is None:
        response["needs_action"] = True
        response["message"] = "You do not have an active assignment. Please select a free desk."
    elif active_assignment.assignment_type == Assignment.TYPE_WFH:
        response["message"] = "You are scheduled to work from home."
    else:
        desk = active_assignment.desk
        block_zones = [zone.name for zone in desk.block_zones.all() if zone.is_active(now)]
        if block_zones:
            response["needs_action"] = True
            response["message"] = (
                "Your workspace is under construction. Please select a new location."
            )
            response["assignment"]["blocked_zones"] = block_zones
        else:
            response["message"] = f"You are assigned to {desk.label} in {desk.department.name}."

    return JsonResponse(response)


@require_POST
def authenticate_employee(request):
    last_name = (request.POST.get("last_name") or "").strip()
    extension = (request.POST.get("extension") or "").strip()

    if not last_name or not extension:
        return JsonResponse(
            {
                "error": "Please enter your last name and the last four digits of your phone extension.",
            },
            status=400,
        )

    normalized_extension = normalize_extension_input(extension)
    if len(normalized_extension) != 4:
        return JsonResponse(
            {
                "error": "Please double-check that you're using only the last four digits of your extension.",
            },
            status=400,
        )

    employee = match_employee(last_name, extension)
    if employee is None:
        return JsonResponse(
            {
                "error": "We couldn't find a match for those details. Verify your last name and extension and try again.",
            },
            status=400,
        )

    profile = {
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "full_name": employee.full_name,
    }
    request.session[SESSION_EMPLOYEE_PROFILE_KEY] = profile
    return JsonResponse(profile)


@require_GET
def desk_detail(request, identifier: str):
    desk = get_object_or_404(
        Desk.objects.select_related("department").prefetch_related("block_zones", "assignments"),
        identifier=identifier,
    )
    return JsonResponse(_desk_payload(desk))


@require_POST
def assign_to_desk(request, identifier: str):
    desk = get_object_or_404(Desk, identifier=identifier)
    profile = request.session.get(SESSION_EMPLOYEE_PROFILE_KEY) or {}
    assignee_name = (profile.get("full_name") or "").strip()
    if not assignee_name:
        return JsonResponse(
            {
                "error": "Please verify your employee information before reserving a seat.",
            },
            status=403,
        )

    now = timezone.now()
    if desk.is_blocked(now):
        return JsonResponse(
            {
                "error": "This desk is currently unavailable due to a block-out zone.",
                "desk": _desk_payload(desk, now),
            },
            status=400,
        )

    if desk.active_assignment(now):
        return JsonResponse(
            {"error": "This desk is already assigned.", "desk": _desk_payload(desk, now)},
            status=400,
        )

    end_raw = request.POST.get("end")
    if end_raw:
        try:
            parsed_end = datetime.fromisoformat(end_raw)
            if timezone.is_naive(parsed_end):
                parsed_end = timezone.make_aware(parsed_end, timezone.get_current_timezone())
        except ValueError:
            return JsonResponse({"error": "Invalid end date."}, status=400)
    else:
        local_now = timezone.localtime(now)
        parsed_end = local_now.replace(hour=23, minute=59, second=0, microsecond=0)
        if parsed_end <= now:
            parsed_end += timedelta(days=1)

    Assignment.objects.filter(
        assignee_name__iexact=assignee_name,
        assignment_type=Assignment.TYPE_DESK,
    ).filter(
        models.Q(is_permanent=True)
        | models.Q(end__isnull=True)
        | models.Q(end__gte=now)
    ).update(end=now, is_permanent=False)

    assignment = Assignment.objects.create(
        desk=desk,
        assignment_type=Assignment.TYPE_DESK,
        assignee_name=assignee_name,
        start=now,
        end=parsed_end,
        is_permanent=False,
        note="Self-service assignment",
        created_by="Self-service",
    )
    return JsonResponse(
        {
            "success": True,
            "desk": _desk_payload(desk),
            "assignment": _serialize_assignment(assignment),
        }
    )

@staff_member_required
def admin_console(request):
    now = timezone.now()
    local_now = timezone.localtime(now)

    assignments = (
        Assignment.objects.select_related("desk", "desk__department")
        .order_by("assignee_name", "-start")
    )
    active_assignments = [assignment for assignment in assignments if assignment.is_active(now)]
    block_zone_queryset = (
        BlockOutZone.objects.prefetch_related("desks").order_by("start", "name")
    )
    scheduled_blocks: list[BlockOutZone] = []
    block_zone_payload: list[dict] = []
    for zone in block_zone_queryset:
        is_active = zone.is_active(now)
        starts_in_future = bool(zone.start and zone.start > now)
        if not is_active and not starts_in_future:
            continue
        setattr(zone, "admin_is_active", is_active)
        scheduled_blocks.append(zone)
        block_zone_payload.append(
            {
                "id": zone.pk,
                "name": zone.name,
                "desk_count": zone.desks.count(),
                "is_permanent": zone.is_permanent,
                "duration_choice": "permanent" if zone.is_permanent else "temporary",
                "reason": zone.reason or "",
                "created_by": zone.created_by or "",
                "start": _datetime_input_value(zone.start),
                "end": "" if zone.is_permanent else _datetime_input_value(zone.end),
                "start_display": _datetime_display_value(zone.start),
                "end_display": _datetime_display_value(zone.end),
                "is_active": is_active,
                "duration_display": _block_zone_duration_display(zone),
            }
        )
    desks = (
        Desk.objects.select_related("department")
        .prefetch_related("block_zones", "assignments")
        .all()
    )
    layout_desks = [_desk_payload(desk, now) for desk in desks]

    context = {
        "active_assignments": active_assignments,
        "block_zones": scheduled_blocks,
        "block_zone_data": json.dumps(block_zone_payload),
        "now": local_now,
        "layout_desks": json.dumps(layout_desks),
        "grid_rows": GRID_ROWS,
        "grid_columns": GRID_COLUMNS,
        "departments": Department.objects.all(),
    }
    return render(request, "floorplan/admin_console.html", context)

@staff_member_required
@require_POST
def delete_block_zone(request, pk: int):
    block_zone = get_object_or_404(BlockOutZone, pk=pk)
    block_zone.delete()
    messages.success(request, f"Block-out zone '{block_zone.name}' deleted.")
    return redirect("floorplan:admin-console")


@staff_member_required
@require_POST
def update_block_zone(request, pk: int):
    block_zone = get_object_or_404(BlockOutZone, pk=pk)

    name = (request.POST.get("name") or "").strip()
    if not name:
        messages.error(request, "Enter a name for this block-out zone before saving.")
        return redirect("floorplan:admin-console")

    duration_choice = request.POST.get("duration_choice") or "temporary"
    is_permanent = duration_choice == "permanent"

    start_raw = (request.POST.get("start") or "").strip()
    end_raw = (request.POST.get("end") or "").strip()

    try:
        if start_raw:
            parsed_start = datetime.fromisoformat(start_raw)
            if timezone.is_naive(parsed_start):
                parsed_start = timezone.make_aware(
                    parsed_start, timezone.get_current_timezone()
                )
        else:
            parsed_start = block_zone.start or timezone.now()
    except ValueError:
        messages.error(request, "Invalid start date for this block-out zone.")
        return redirect("floorplan:admin-console")

    parsed_end = None
    if not is_permanent and end_raw:
        try:
            parsed_end = datetime.fromisoformat(end_raw)
            if timezone.is_naive(parsed_end):
                parsed_end = timezone.make_aware(
                    parsed_end, timezone.get_current_timezone()
                )
        except ValueError:
            messages.error(request, "Invalid end date for this block-out zone.")
            return redirect("floorplan:admin-console")

    if not is_permanent and parsed_end and parsed_end <= parsed_start:
        messages.error(
            request,
            "The block-out zone must end after it begins. Adjust the end time and try again.",
        )
        return redirect("floorplan:admin-console")

    block_zone.name = name
    block_zone.start = parsed_start
    block_zone.is_permanent = is_permanent
    block_zone.end = None if is_permanent else parsed_end
    block_zone.reason = (request.POST.get("reason") or "").strip()
    block_zone.created_by = (request.POST.get("created_by") or "").strip()
    block_zone.save(
        update_fields=["name", "start", "end", "is_permanent", "reason", "created_by"]
    )

    messages.success(request, f"Block-out zone '{block_zone.name}' updated.")
    return redirect("floorplan:admin-console")


@staff_member_required
@require_POST
def end_assignment(request, pk: int):
    assignment = get_object_or_404(Assignment, pk=pk)
    assignment.end = timezone.now()
    assignment.is_permanent = False
    assignment.save(update_fields=["end", "is_permanent"])
    messages.success(request, f"Assignment for {assignment.assignee_name} has been ended.")
    return redirect("floorplan:admin-console")

@staff_member_required
@require_POST
def update_layout(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON payload."}, status=400)

    action = payload.get("action", "assign").lower()
    cells = payload.get("cells") or []
    if not isinstance(cells, list) or not cells:
        return JsonResponse({"error": "Please select at least one cell."}, status=400)

    normalized_cells: list[tuple[int, int]] = []
    seen = set()
    for cell in cells:
        try:
            row = int(cell["row"])
            column = int(cell["column"])
        except (KeyError, TypeError, ValueError):
            return JsonResponse({"error": "Invalid cell coordinates."}, status=400)
        if not (1 <= row <= GRID_ROWS and 1 <= column <= GRID_COLUMNS):
            return JsonResponse({"error": "Selected cell is outside the 30x13 grid."}, status=400)
        key = (row, column)
        if key not in seen:
            seen.add(key)
            normalized_cells.append(key)

    if action not in {"assign", "clear", "block", "assignment"}:
        return JsonResponse({"error": "Unsupported action."}, status=400)

    now = timezone.now()
    local_now = timezone.localtime(now)
    updated_identifiers: set[str] = set()
    cleared_cells: list[dict[str, int]] = []
    created_assignments: list[Assignment] = []
    blocked_count = 0

    with transaction.atomic():
        if action == "assign":
            data = payload.get("data") or {}
            department_id = data.get("department")
            if not department_id:
                return JsonResponse({"error": "Department is required."}, status=400)
            try:
                department = Department.objects.get(pk=department_id)
            except Department.DoesNotExist:
                return JsonResponse({"error": "Department not found."}, status=404)

            label_value = (data.get("label") or "").strip()
            fill_color = (data.get("fill_color") or "").strip()
            notes_value = (data.get("notes") or "").strip()

            for row, column in normalized_cells:
                left, top, width, height = grid_to_percentages(row, column)
                desk, created = Desk.objects.select_for_update().get_or_create(
                    row_index=row,
                    column_index=column,
                    defaults={
                        "identifier": cell_identifier(row, column),
                        "label": label_value or f"{department.name} r{row:02d}c{column:02d}",
                        "department": department,
                        "fill_color": fill_color,
                        "notes": notes_value,
                        "row_span": 1,
                        "column_span": 1,
                        "left_percentage": left,
                        "top_percentage": top,
                        "width_percentage": width,
                        "height_percentage": height,
                    },
                )
                if not created:
                    desk.department = department
                    if label_value:
                        desk.label = label_value
                    elif not desk.label:
                        desk.label = f"{department.name} r{row:02d}c{column:02d}"
                    desk.fill_color = fill_color
                    desk.notes = notes_value
                    desk.row_index = row
                    desk.column_index = column
                    desk.row_span = 1
                    desk.column_span = 1
                    desk.left_percentage = left
                    desk.top_percentage = top
                    desk.width_percentage = width
                    desk.height_percentage = height
                    desk.save()
                else:
                    updated_identifiers.add(desk.identifier)
                    continue
                updated_identifiers.add(desk.identifier)
        elif action == "clear":
            for row, column in normalized_cells:
                try:
                    desk = Desk.objects.select_for_update().get(
                        row_index=row, column_index=column
                    )
                except Desk.DoesNotExist:
                    continue
                cleared_cells.append({"row": row, "column": column})
                desk.delete()
        elif action == "block":
            data = payload.get("data") or {}
            desks = []
            for row, column in normalized_cells:
                try:
                    desk = Desk.objects.select_for_update().get(
                        row_index=row, column_index=column
                    )
                except Desk.DoesNotExist:
                    continue
                desks.append(desk)
            if not desks:
                return JsonResponse(
                    {"error": "Select desks with existing workspaces before blocking."},
                    status=400,
                )

            form_data = QueryDict("", mutable=True)
            form_data["name"] = (data.get("name") or "").strip()
            form_data["duration_choice"] = data.get("duration_choice") or "temporary"
            form_data["start"] = data.get("start") or local_now.strftime("%Y-%m-%dT%H:%M")
            if data.get("end"):
                form_data["end"] = data["end"]
            if data.get("reason"):
                form_data["reason"] = data["reason"]
            if data.get("created_by"):
                form_data["created_by"] = data["created_by"]
            form_data.setlist("desks", [str(desk.pk) for desk in desks])

            block_form = BlockOutZoneForm(form_data)
            if not block_form.is_valid():
                return JsonResponse(
                    {"error": _first_form_error(block_form, "Unable to save block-out zone.")},
                    status=400,
                )
            block = block_form.save()
            blocked_count = block.desks.count()
            updated_identifiers.update(block.desks.values_list("identifier", flat=True))
        else:  # assignment
            data = payload.get("data") or {}
            desks = []
            for row, column in normalized_cells:
                try:
                    desk = Desk.objects.select_for_update().get(
                        row_index=row, column_index=column
                    )
                except Desk.DoesNotExist:
                    continue
                desks.append(desk)

            assignable_desks = [
                desk
                for desk in desks
                if desk.department.name not in {"Utility/Resource", "Walkway"}
            ]

            if not assignable_desks:
                return JsonResponse(
                    {"error": "Select at least one assignable desk before saving."},
                    status=400,
                )

            assignee_name = (data.get("assignee_name") or "").strip()
            if not assignee_name:
                return JsonResponse(
                    {"error": "Employee name is required to create an assignment."},
                    status=400,
                )

            duration_choice = data.get("duration_choice") or "temporary"
            start_value = data.get("start") or local_now.strftime("%Y-%m-%dT%H:%M")
            end_value = data.get("end") if duration_choice != "permanent" else None

            forms_to_save: list[tuple[AssignmentForm, Desk]] = []
            for desk in assignable_desks:
                form_data = QueryDict("", mutable=True)
                form_data["assignee_name"] = assignee_name
                form_data["assignment_type"] = data.get(
                    "assignment_type", Assignment.TYPE_DESK
                )
                form_data["desk"] = str(desk.pk)
                form_data["duration_choice"] = duration_choice
                form_data["start"] = start_value
                if end_value:
                    form_data["end"] = end_value
                if data.get("note"):
                    form_data["note"] = data["note"]
                if data.get("created_by"):
                    form_data["created_by"] = data["created_by"]

                assignment_form = AssignmentForm(form_data)
                if not assignment_form.is_valid():
                    return JsonResponse(
                        {
                            "error": _first_form_error(
                                assignment_form, "Unable to save assignment."
                            )
                        },
                        status=400,
                    )
                forms_to_save.append((assignment_form, desk))

            for assignment_form, desk in forms_to_save:
                assignment = assignment_form.save()
                created_assignments.append(assignment)
                updated_identifiers.add(desk.identifier)

    refreshed = (
        Desk.objects.select_related("department")
        .prefetch_related("block_zones", "assignments")
        .filter(identifier__in=list(updated_identifiers))
    )
    updated_payloads = [_desk_payload(desk, now) for desk in refreshed]

    message = ""
    if action == "assign":
        message = f"Updated {len(updated_identifiers)} cell(s)."
    elif action == "clear":
        message = f"Cleared {len(cleared_cells)} cell(s)."
    elif action == "block":
        message = f"Blocked {blocked_count} desk(s)."
    else:
        message = f"Created {len(created_assignments)} assignment(s)."

    return JsonResponse(
        {
            "updated": updated_payloads,
            "cleared": cleared_cells,
            "message": message,
        }
    )
