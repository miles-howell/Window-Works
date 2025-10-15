import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from django.urls import reverse

from .employees import clear_employee_cache, normalize_extension_input


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
