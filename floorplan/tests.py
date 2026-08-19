import json
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import Assignment, Department, Desk
from .views import _desk_payload


class DeskPayloadTests(TestCase):
    def setUp(self):
        super().setUp()
        self.walkway = Department.objects.create(name="Walkway", color="#FFFFFF")
        self.utility = Department.objects.create(name="Utility/Resource", color="#EEEEEE")

    def test_walkway_kiosk_is_treated_as_assignable(self):
        desk = Desk.objects.create(
            identifier="walkway-kiosk",
            label="Kiosk",
            department=self.walkway,
            fill_color="#000000",
            row_index=1,
            column_index=1,
            row_span=1,
            column_span=1,
            left_percentage=0,
            top_percentage=0,
            width_percentage=10,
            height_percentage=10,
            notes="",
        )

        payload = _desk_payload(desk, now=timezone.now())

        self.assertTrue(payload["is_kiosk"])
        self.assertTrue(payload["is_assignable"])
        self.assertEqual(payload["status"], "free")

    def test_walkway_desk_without_kiosk_label_stays_non_assignable(self):
        desk = Desk.objects.create(
            identifier="walkway-seat",
            label="Hallway",
            department=self.walkway,
            fill_color="#FFFFFF",
            row_index=1,
            column_index=2,
            row_span=1,
            column_span=1,
            left_percentage=10,
            top_percentage=0,
            width_percentage=10,
            height_percentage=10,
            notes="",
        )

        payload = _desk_payload(desk, now=timezone.now())

        self.assertFalse(payload["is_kiosk"])
        self.assertFalse(payload["is_assignable"])

    def test_kiosk_detected_from_notes(self):
        desk = Desk.objects.create(
            identifier="utility-kiosk",
            label="Shared space",
            department=self.utility,
            fill_color="#CCCCCC",
            row_index=1,
            column_index=3,
            row_span=1,
            column_span=1,
            left_percentage=20,
            top_percentage=0,
            width_percentage=10,
            height_percentage=10,
            notes="Temporary kiosk location",
        )

        payload = _desk_payload(desk, now=timezone.now())

        self.assertTrue(payload["is_kiosk"])
        self.assertTrue(payload["is_assignable"])

    def test_kiosk_detected_from_identifier(self):
        desk = Desk.objects.create(
            identifier="utility-temp-kiosk",
            label="Shared space",
            department=self.utility,
            fill_color="#CCCCCC",
            row_index=2,
            column_index=3,
            row_span=1,
            column_span=1,
            left_percentage=25,
            top_percentage=5,
            width_percentage=10,
            height_percentage=10,
            notes="Temporary information desk",
        )

        payload = _desk_payload(desk, now=timezone.now())

        self.assertTrue(payload["is_kiosk"])
        self.assertTrue(payload["is_assignable"])


class AdminConsoleScheduleTests(TestCase):
    def setUp(self):
        super().setUp()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pass1234",
            is_staff=True,
        )
        self.client.force_login(self.user)
        self.department = Department.objects.create(name="Operations", color="#123456")
        self.desk = Desk.objects.create(
            identifier="ops-1",
            label="Ops Desk",
            department=self.department,
            fill_color="",
            row_index=1,
            column_index=1,
            row_span=1,
            column_span=1,
            left_percentage=0,
            top_percentage=0,
            width_percentage=10,
            height_percentage=10,
            notes="",
        )

    @override_settings(
        STORAGES={
            "staticfiles": {
                "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
            }
        }
    )
    def test_future_schedule_reflects_selected_date(self):
        target_date = timezone.localdate() + timedelta(days=1)
        tz = timezone.get_current_timezone()
        start = timezone.make_aware(datetime.combine(target_date, time(9, 0)), tz)
        end = start + timedelta(hours=8)

        assignment = Assignment.objects.create(
            desk=self.desk,
            assignment_type=Assignment.TYPE_DESK,
            assignee_name="Future Teammate",
            start=start,
            end=end,
        )

        response = self.client.get(
            reverse("floorplan:admin-console"), {"view_date": target_date.isoformat()}
        )

        self.assertEqual(response.status_code, 200)
        layout_desks = json.loads(response.context["layout_desks"])
        desk_payload = next(item for item in layout_desks if item["identifier"] == "ops-1")
        self.assertIsNotNone(desk_payload["assignment"])
        self.assertEqual(desk_payload["assignment"]["assignee"], "Future Teammate")

        active_assignments = response.context["active_assignments"]
        self.assertIn(assignment, active_assignments)
        self.assertEqual(response.context["view_date"], target_date)
