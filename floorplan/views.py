from __future__ import annotations

import json
from datetime import datetime, time, timedelta

from django.contrib import messages
from django.db import models, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .forms import AssignmentForm, BlockOutZoneForm
from .layout import GRID_COLUMNS, GRID_ROWS, cell_identifier, grid_to_percentages
from .models import Assignment, BlockOutZone, Department, Desk


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


def _desk_payload(desk: Desk, now=None) -> dict:
    now = now or timezone.now()
    active_assignment = desk.active_assignment(now)
    block_zones = [zone for zone in desk.block_zones.all() if zone.is_active(now)]
    status = "free"
    if active_assignment:
        status = "occupied"
    if block_zones:
        status = "blocked"
    is_assignable = desk.department.name not in {"Utility/Resource", "Walkway"}
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
    assignee_name = request.POST.get("assignee_name", "").strip()
    if not assignee_name:
        return JsonResponse({"error": "Please enter a name."}, status=400)

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


def admin_console(request):
    now = timezone.now()
    local_now = timezone.localtime(now)
    formatted_now = local_now.strftime("%Y-%m-%dT%H:%M")
    assignment_initial = {"start": formatted_now}
    block_initial = {"start": formatted_now}
    assignment_form = AssignmentForm(initial=assignment_initial)
    block_form = BlockOutZoneForm(initial=block_initial)

    if request.method == "POST":
        form_type = request.POST.get("form_type")
        if form_type == "assignment":
            assignment_form = AssignmentForm(request.POST)
            if assignment_form.is_valid():
                assignment = assignment_form.save()
                messages.success(
                    request,
                    f"Assignment saved for {assignment.assignee_name}.",
                )
                return redirect("floorplan:admin-console")
            else:
                messages.error(request, "Please correct the errors in the assignment form.")
        elif form_type == "block":
            block_form = BlockOutZoneForm(request.POST)
            if block_form.is_valid():
                block = block_form.save()
                messages.success(request, f"Block-out zone '{block.name}' saved.")
                return redirect("floorplan:admin-console")
            else:
                messages.error(request, "Please correct the errors in the block-out form.")

    assignments = (
        Assignment.objects.select_related("desk", "desk__department")
        .order_by("assignee_name", "-start")
    )
    active_assignments = [assignment for assignment in assignments if assignment.is_active(now)]
    block_zones = BlockOutZone.objects.prefetch_related("desks")
    active_blocks = [zone for zone in block_zones if zone.is_active(now)]
    desks = (
        Desk.objects.select_related("department")
        .prefetch_related("block_zones", "assignments")
        .all()
    )
    layout_desks = [_desk_payload(desk, now) for desk in desks]

    context = {
        "assignment_form": assignment_form,
        "block_form": block_form,
        "active_assignments": active_assignments,
        "active_blocks": active_blocks,
        "now": local_now,
        "layout_desks": json.dumps(layout_desks),
        "grid_rows": GRID_ROWS,
        "grid_columns": GRID_COLUMNS,
        "departments": Department.objects.all(),
    }
    return render(request, "floorplan/admin_console.html", context)


@require_POST
def delete_block_zone(request, pk: int):
    block_zone = get_object_or_404(BlockOutZone, pk=pk)
    block_zone.delete()
    messages.success(request, f"Block-out zone '{block_zone.name}' deleted.")
    return redirect("floorplan:admin-console")


@require_POST
def end_assignment(request, pk: int):
    assignment = get_object_or_404(Assignment, pk=pk)
    assignment.end = timezone.now()
    assignment.is_permanent = False
    assignment.save(update_fields=["end", "is_permanent"])
    messages.success(request, f"Assignment for {assignment.assignee_name} has been ended.")
    return redirect("floorplan:admin-console")


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

    if action not in {"assign", "clear"}:
        return JsonResponse({"error": "Unsupported action."}, status=400)

    now = timezone.now()
    updated_identifiers: set[str] = set()
    cleared_cells: list[dict[str, int]] = []

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
        else:  # clear
            for row, column in normalized_cells:
                try:
                    desk = Desk.objects.select_for_update().get(
                        row_index=row, column_index=column
                    )
                except Desk.DoesNotExist:
                    continue
                cleared_cells.append({"row": row, "column": column})
                desk.delete()

    refreshed = (
        Desk.objects.select_related("department")
        .prefetch_related("block_zones", "assignments")
        .filter(identifier__in=list(updated_identifiers))
    )
    updated_payloads = [_desk_payload(desk, now) for desk in refreshed]

    message = ""
    if action == "assign":
        message = f"Updated {len(updated_identifiers)} cell(s)."
    else:
        message = f"Cleared {len(cleared_cells)} cell(s)."

    return JsonResponse(
        {
            "updated": updated_payloads,
            "cleared": cleared_cells,
            "message": message,
        }
    )
