from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from django.conf import settings


@dataclass(frozen=True)
class EmployeeRecord:
    first_name: str
    last_name: str
    extension_last4: str

    @property
    def full_name(self) -> str:
        parts = [self.first_name.strip(), self.last_name.strip()]
        return " ".join(part for part in parts if part)


def _default_employee_path() -> Path:
    configured = getattr(settings, "EMP_CSV_PATH", None)
    if configured:
        return Path(configured)
    return Path(settings.BASE_DIR) / "media" / "employees.csv"


def _last_four_digits(value: str) -> str:
    digits = "".join(char for char in value if char.isdigit())
    if len(digits) <= 4:
        return digits
    return digits[-4:]


@lru_cache(maxsize=1)
def load_employee_records() -> tuple[EmployeeRecord, ...]:
    path = _default_employee_path()
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            records: list[EmployeeRecord] = []
            for row in reader:
                if row is None:
                    continue
                first = (row.get("First") or "").strip()
                last = (row.get("Last") or "").strip()
                extension = (row.get("Extension") or "").strip()
                last4 = _last_four_digits(extension)
                if not last or len(last4) != 4:
                    continue
                records.append(
                    EmployeeRecord(
                        first_name=first,
                        last_name=last,
                        extension_last4=last4,
                    )
                )
    except FileNotFoundError:
        return tuple()
    return tuple(records)


def clear_employee_cache() -> None:
    load_employee_records.cache_clear()


def normalize_last_name(value: str) -> str:
    return value.strip().lower()


def normalize_extension_input(value: str) -> str:
    trimmed = (value or "").strip()
    if trimmed.lower().startswith("69-") and len(trimmed) >= 7:
        trimmed = trimmed[3:]
    digits = "".join(char for char in trimmed if char.isdigit())
    if len(digits) <= 4:
        return digits
    return digits[-4:]


def match_employee(last_name: str, extension: str) -> EmployeeRecord | None:
    normalized_last = normalize_last_name(last_name)
    normalized_extension = normalize_extension_input(extension)
    if not normalized_last or len(normalized_extension) != 4:
        return None
    for record in load_employee_records():
        if normalize_last_name(record.last_name) == normalized_last and record.extension_last4 == normalized_extension:
            return record
    return None
