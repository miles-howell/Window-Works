from __future__ import annotations

import json
from datetime import datetime, time, timedelta

from django.contrib import messages
from django.db import models
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .forms import AssignmentForm, BlockOutZoneForm
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
    return {
        "identifier": desk.identifier,
        "label": desk.label,
        "department": desk.department.name,
        "department_color": desk.department.color,
        "notes": desk.notes,
        "style": {
            "left": f"{desk.left_percentage}%",
            "top": f"{desk.top_percentage}%",
            "width": f"{desk.width_percentage}%",
            "height": f"{desk.height_percentage}%",
        },
        "status": status,
        "is_blocked": bool(block_zones),
        "block_zones": [zone.name for zone in block_zones],
        "assignment": _serialize_assignment(active_assignment, now),
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

    context = {
        "assignment_form": assignment_form,
        "block_form": block_form,
        "active_assignments": active_assignments,
        "active_blocks": active_blocks,
        "now": local_now,
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
