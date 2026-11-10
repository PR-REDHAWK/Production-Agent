"""Generate synthetic 90-day API gateway access logs for Inventory & Recon testing."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ACTIVE_ROUTES = [
    ("GET", "/api/v3/search", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/holds", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/bookings", 200, "Mozilla/5.0 AgencyPortal"),
    ("GET", "/api/v3/bookings/1001", 200, "Mozilla/5.0 AgencyPortal"),
    ("GET", "/api/v3/bookings/2001", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/bookings/1001/pay", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/bookings/1001/confirm", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/bookings/1001/cancel", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/bookings/1001/refund", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/coupons/apply", 200, "Mozilla/5.0 AgencyPortal"),
    ("PATCH", "/api/v3/users/me", 200, "Mozilla/5.0 AgencyPortal"),
    ("POST", "/api/v3/suppliers/webhook-test", 200, "Mozilla/5.0 AgencyPortal"),
]

# Shadow endpoint: receives traffic in logs, absent from UI/JS/ownership
SHADOW_ROUTES = [
    ("GET", "/internal/shadow-export", 200, "legacy-etl-cron/1.0"),
]

# Noise 404 scanner routes (must not be confused with real shadow APIs)
NOISE_404_ROUTES = [
    ("GET", "/wp-login.php", 404, "scanner-bot/0.1"),
    ("GET", "/.env", 404, "scanner-bot/0.1"),
]


def generate_gateway_logs(output_path: Path, days: int = 90) -> int:
    """Write synthetic 90-day gateway access logs as JSONL.

    Intentionally excludes /api/v1/bookings/{id} so InventoryAgent flags it as Zombie,
    and includes /internal/shadow-export so InventoryAgent flags it as Shadow.
    """
    now = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
    entries: list[dict[str, object]] = []

    for day_offset in range(days, 0, -1):
        ts = now - timedelta(days=day_offset)
        for idx, (method, path, status_code, ua) in enumerate(ACTIVE_ROUTES):
            entries.append(
                {
                    "timestamp": (ts + timedelta(minutes=idx * 5)).isoformat(),
                    "method": method,
                    "path": path,
                    "status": status_code,
                    "latency_ms": 25 + (idx * 3),
                    "user_agent": ua,
                    "agency_id": "AGENCY_ALPHA" if idx % 2 == 0 else "AGENCY_BETA",
                }
            )
        if day_offset % 7 == 0:
            for method, path, status_code, ua in SHADOW_ROUTES:
                entries.append(
                    {
                        "timestamp": (ts + timedelta(hours=3)).isoformat(),
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "latency_ms": 42,
                        "user_agent": ua,
                        "agency_id": "INTERNAL_BATCH",
                    }
                )
        if day_offset % 15 == 0:
            for method, path, status_code, ua in NOISE_404_ROUTES:
                entries.append(
                    {
                        "timestamp": (ts + timedelta(hours=6)).isoformat(),
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "latency_ms": 4,
                        "user_agent": ua,
                        "agency_id": None,
                    }
                )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        for entry in entries:
            fh.write(json.dumps(entry) + "\n")
    return len(entries)


if __name__ == "__main__":
    target_file = Path(__file__).resolve().parent / "sample_gateway_logs.jsonl"
    count = generate_gateway_logs(target_file)
    print(f"Generated {count} synthetic gateway log entries at {target_file}")
