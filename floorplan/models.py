from __future__ import annotations

from django.db import models
from django.utils import timezone


class Department(models.Model):
    """Represents an area or functional group in the building."""

    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(
        max_length=20,
        help_text="Hex or CSS color value used to render the department on the floor plan.",
    )
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover - human readable helper
        return self.name


class Desk(models.Model):
    """Single seating location rendered on the floor plan."""

    identifier = models.SlugField(
        unique=True,
        help_text="Unique slug used to identify the desk in URLs and the UI.",
    )
    label = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    left_percentage = models.FloatField(
        help_text="Horizontal position (0-100) relative to the floor plan container."
    )
    top_percentage = models.FloatField(
        help_text="Vertical position (0-100) relative to the floor plan container."
    )
    width_percentage = models.FloatField(
        help_text="Width (0-100) relative to the floor plan container."
    )
    height_percentage = models.FloatField(
        help_text="Height (0-100) relative to the floor plan container."
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["label"]

    def __str__(self) -> str:  # pragma: no cover - human readable helper
        return self.label

    def active_assignment(self, reference_time=None):
        """Return the current assignment for the desk, if any."""

        reference_time = reference_time or timezone.now()
        return (
            self.assignments.filter(
                assignment_type=Assignment.TYPE_DESK,
                start__lte=reference_time,
            )
            .filter(
                models.Q(is_permanent=True)
                | models.Q(end__isnull=True)
                | models.Q(end__gte=reference_time)
            )
            .order_by("-start", "-created_at")
            .first()
        )

    def is_blocked(self, reference_time=None) -> bool:
        reference_time = reference_time or timezone.now()
        return any(zone.is_active(reference_time) for zone in self.block_zones.all())


class Assignment(models.Model):
    """Represents a user occupying a desk or working remotely."""

    TYPE_DESK = "desk"
    TYPE_WFH = "wfh"
    ASSIGNMENT_TYPE_CHOICES = [
        (TYPE_DESK, "Desk"),
        (TYPE_WFH, "Work From Home"),
    ]

    desk = models.ForeignKey(
        Desk,
        related_name="assignments",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    assignment_type = models.CharField(
        max_length=10,
        choices=ASSIGNMENT_TYPE_CHOICES,
        default=TYPE_DESK,
    )
    assignee_name = models.CharField(max_length=200)
    start = models.DateTimeField(default=timezone.now)
    end = models.DateTimeField(blank=True, null=True)
    is_permanent = models.BooleanField(default=False)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-start", "assignee_name"]

    def __str__(self) -> str:  # pragma: no cover - helper
        target = self.desk.label if self.desk else "WFH"
        return f"{self.assignee_name} -> {target}"

    def is_active(self, reference_time=None) -> bool:
        reference_time = reference_time or timezone.now()
        if self.start and self.start > reference_time:
            return False
        if self.is_permanent:
            return True
        if self.end is None:
            return True
        return self.end >= reference_time

    @property
    def duration_display(self) -> str:
        if self.is_permanent:
            return "Permanent"
        if self.end:
            return f"Until {timezone.localtime(self.end).strftime('%b %d, %Y %I:%M %p')}"
        return "Open ended"


class BlockOutZone(models.Model):
    """Represents a collection of desks unavailable for a time period."""

    name = models.CharField(max_length=150)
    desks = models.ManyToManyField(Desk, related_name="block_zones")
    start = models.DateTimeField(default=timezone.now)
    end = models.DateTimeField(blank=True, null=True)
    is_permanent = models.BooleanField(default=False)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-start", "name"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name

    def is_active(self, reference_time=None) -> bool:
        reference_time = reference_time or timezone.now()
        if self.start and self.start > reference_time:
            return False
        if self.is_permanent:
            return True
        if self.end is None:
            return True
        return self.end >= reference_time
