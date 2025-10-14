from django.contrib import admin

from .models import Assignment, BlockOutZone, Department, Desk


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "color")
    search_fields = ("name",)


@admin.register(Desk)
class DeskAdmin(admin.ModelAdmin):
    list_display = ("label", "identifier", "department", "fill_color")
    list_filter = ("department",)
    search_fields = ("label", "identifier")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("assignee_name", "assignment_type", "desk", "start", "end", "is_permanent")
    list_filter = ("assignment_type", "is_permanent", "desk__department")
    search_fields = ("assignee_name", "desk__label")


@admin.register(BlockOutZone)
class BlockOutZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "start", "end", "is_permanent")
    filter_horizontal = ("desks",)
    search_fields = ("name", "reason")
