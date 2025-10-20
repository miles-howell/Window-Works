import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .employees import clear_employee_cache, normalize_extension_input
from .models import Department, Desk
from .views import _desk_payload


class EmployeeAuthenticationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.csv_path = Path(self.tempdir.name) / "employees.csv"
        self.csv_path.write_text(
            """First,Last,Extension\nJohn,Doe,417-234-1234\nPickle,Rick,+1 (417) 234- 6969\nMiles,Howell,69-2853\n""",
            encoding="utf-8",
        )
        self.override = override_settings(EMP_CSV_PATH=str(self.csv_path))
        self.override.enable()
        self.addCleanup(self.override.disable)
        clear_employee_cache()
        self.addCleanup(clear_employee_cache)

    def test_normalize_extension_trims_common_prefix(self):
        self.assertEqual(normalize_extension_input("69-2853"), "2853")

    def test_authentication_matches_case_insensitive_last_name(self):
        response = self.client.post(
            reverse("floorplan:employee-auth"),
            {"last_name": "doe", "extension": "1234"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["full_name"], "John Doe")
        self.assertEqual(payload["first_name"], "John")
        self.assertEqual(payload["last_name"], "Doe")

    def test_authentication_accepts_extension_with_prefix(self):
        response = self.client.post(
            reverse("floorplan:employee-auth"),
            {"last_name": "Howell", "extension": "69-2853"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["full_name"], "Miles Howell")

    def test_authentication_rejects_unknown_extension(self):
        response = self.client.post(
            reverse("floorplan:employee-auth"),
            {"last_name": "Doe", "extension": "9999"},
        )
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertIn("error", payload)


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
