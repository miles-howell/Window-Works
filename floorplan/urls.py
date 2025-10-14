from django.urls import path

from . import views

app_name = "floorplan"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/assignment-info/", views.assignment_info, name="assignment-info"),
    path("api/desks/<slug:identifier>/", views.desk_detail, name="desk-detail"),
    path(
        "api/desks/<slug:identifier>/assign/",
        views.assign_to_desk,
        name="assign-to-desk",
    ),
    path("admin-console/", views.admin_console, name="admin-console"),
    path(
        "admin-console/block-zone/<int:pk>/delete/",
        views.delete_block_zone,
        name="delete-block-zone",
    ),
    path(
        "admin-console/assignment/<int:pk>/end/",
        views.end_assignment,
        name="end-assignment",
    ),
]
