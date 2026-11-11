"""SQLite persistence backend for mock_tbo_target (synthetic travel data only)."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Literal

VersionLiteral = Literal["v1.0", "v1.1", "v1.2"]


def load_synthetic_users() -> dict[str, dict[str, Any]]:
    vault_path = Path(__file__).resolve().parent.parent / "configs" / "credentials.vault.json"
    default_users: dict[str, dict[str, Any]] = {
        "alpha_admin@synthetic-travel.test": {
            "user_id": "USR-ALPHA-1",
            "username": "alpha_admin@synthetic-travel.test",
            "password": os.environ.get("MOCK_ALPHA_ADMIN_PASS", "synth-alpha-admin-pass"),
            "agency_id": "AGENCY_ALPHA",
            "role": "admin",
            "display_name": "Alpha Lead Admin",
            "credit_limit": 50000.0,
        },
        "alpha_sub@synthetic-travel.test": {
            "user_id": "USR-ALPHA-2",
            "username": "alpha_sub@synthetic-travel.test",
            "password": os.environ.get("MOCK_ALPHA_SUB_PASS", "synth-alpha-sub-pass"),
            "agency_id": "AGENCY_ALPHA",
            "role": "subagent",
            "display_name": "Alpha Sub Agent",
            "credit_limit": 5000.0,
        },
        "beta_admin@synthetic-travel.test": {
            "user_id": "USR-BETA-1",
            "username": "beta_admin@synthetic-travel.test",
            "password": os.environ.get("MOCK_BETA_ADMIN_PASS", "synth-beta-admin-pass"),
            "agency_id": "AGENCY_BETA",
            "role": "admin",
            "display_name": "Beta Lead Admin",
            "credit_limit": 45000.0,
        },
    }
    if vault_path.exists():
        raw = json.loads(vault_path.read_text(encoding="utf-8"))
        for actor in raw.get("actors", {}).values():
            uname = actor.get("username")
            if uname and uname in default_users:
                env_key = actor.get("password_env", "")
                default_users[uname]["password"] = os.environ.get(
                    env_key, actor.get("default_synthetic_password", default_users[uname]["password"])
                )
    return default_users


_SEED_INVENTORY: list[dict[str, Any]] = [
    {
        "item_id": "INV-DEL-101",
        "type": "hotel",
        "city": "New Delhi",
        "title": "Grand Synthetic Residency",
        "unit_fare": 150.0,
        "currency": "USD",
    },
    {
        "item_id": "INV-DXB-202",
        "type": "flight",
        "city": "Dubai",
        "title": "Synthetic Air DEL-DXB",
        "unit_fare": 320.0,
        "currency": "USD",
    },
    {
        "item_id": "INV-SIN-303",
        "type": "hotel",
        "city": "Singapore",
        "title": "Marina Bay Synthetic Suites",
        "unit_fare": 240.0,
        "currency": "USD",
    },
    {
        "item_id": "INV-LON-404",
        "type": "flight",
        "city": "London",
        "title": "Synthetic Airways BOM-LHR",
        "unit_fare": 580.0,
        "currency": "USD",
    },
    {
        "item_id": "INV-BOM-505",
        "type": "experience",
        "city": "Mumbai",
        "title": "Harbour Heritage Sightseeing",
        "unit_fare": 65.0,
        "currency": "USD",
    },
]

_SEED_COUPONS: list[dict[str, Any]] = [
    {"code": "SAVE20", "discount_amount": 20.0},
    {"code": "CORP50", "discount_amount": 50.0},
]

_SEED_HOLDS: list[dict[str, Any]] = [
    {
        "hold_id": "HOLD-ALPHA-1",
        "agency_id": "AGENCY_ALPHA",
        "item_id": "INV-DEL-101",
        "quantity": 2,
        "quoted_fare": 300.0,
        "discount_applied": 0.0,
        "applied_coupons": [],
    },
    {
        "hold_id": "HOLD-BETA-1",
        "agency_id": "AGENCY_BETA",
        "item_id": "INV-DXB-202",
        "quantity": 1,
        "quoted_fare": 320.0,
        "discount_applied": 0.0,
        "applied_coupons": [],
    },
]

_SEED_BOOKINGS: list[dict[str, Any]] = [
    {
        "booking_id": "1001",
        "agency_id": "AGENCY_ALPHA",
        "created_by": "USR-ALPHA-1",
        "hold_id": "HOLD-ALPHA-1",
        "item_id": "INV-DEL-101",
        "quantity": 2,
        "total_fare": 300.0,
        "paid_amount": 300.0,
        "refunded_amount": 0.0,
        "payment_status": "PAID",
        "status": "CONFIRMED",
        "voucher_code": "VCH-ALPHA-1001",
        "traveller_name": "Aarav Synthetic",
        "traveller_passport": "SYNTH-PASS-ALPHA-001",
        "traveller_email": "aarav.synth@synthetic-traveller.test",
    },
    {
        "booking_id": "2001",
        "agency_id": "AGENCY_BETA",
        "created_by": "USR-BETA-1",
        "hold_id": "HOLD-BETA-1",
        "item_id": "INV-DXB-202",
        "quantity": 1,
        "total_fare": 320.0,
        "paid_amount": 320.0,
        "refunded_amount": 0.0,
        "payment_status": "PAID",
        "status": "CONFIRMED",
        "voucher_code": "VCH-BETA-2001",
        "traveller_name": "Mira Synthetic",
        "traveller_passport": "SYNTH-PASS-BETA-001",
        "traveller_email": "mira.synth@synthetic-traveller.test",
    },
]


class SQLiteTargetDB:
    """Thread-safe SQLite backend store for the demo B2B travel website."""

    def __init__(self, db_path: str | Path, initial_version: VersionLiteral = "v1.0") -> None:
        self._lock = threading.Lock()
        self.db_path = str(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            if self.db_path != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL;")
            self._create_tables()
            if self._is_empty():
                self._seed_all(initial_version)

    def _create_tables(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sim_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                password TEXT NOT NULL,
                agency_id TEXT NOT NULL,
                role TEXT NOT NULL,
                display_name TEXT NOT NULL,
                credit_limit REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                token TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS inventory (
                item_id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                city TEXT NOT NULL,
                title TEXT NOT NULL,
                unit_fare REAL NOT NULL,
                currency TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS coupons (
                code TEXT PRIMARY KEY,
                discount_amount REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS holds (
                hold_id TEXT PRIMARY KEY,
                agency_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                quoted_fare REAL NOT NULL,
                discount_applied REAL NOT NULL,
                applied_coupons TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bookings (
                booking_id TEXT PRIMARY KEY,
                agency_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                hold_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                total_fare REAL NOT NULL,
                paid_amount REAL NOT NULL,
                refunded_amount REAL NOT NULL,
                payment_status TEXT NOT NULL,
                status TEXT NOT NULL,
                voucher_code TEXT,
                traveller_name TEXT NOT NULL,
                traveller_passport TEXT NOT NULL,
                traveller_email TEXT NOT NULL
            );
            """
        )
        self._conn.commit()

    def _is_empty(self) -> bool:
        row = self._conn.execute("SELECT COUNT(*) AS cnt FROM users;").fetchone()
        return int(row["cnt"]) == 0 if row else True

    def _seed_all(self, version: VersionLiteral) -> None:
        for tbl in ("sim_meta", "users", "revoked_tokens", "inventory", "coupons", "holds", "bookings"):
            self._conn.execute(f"DELETE FROM {tbl};")
        self._conn.execute("INSERT INTO sim_meta (key, value) VALUES ('version', ?);", (version,))
        for u in load_synthetic_users().values():
            self._conn.execute(
                """
                INSERT INTO users (username, user_id, password, agency_id, role, display_name, credit_limit)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (u["username"], u["user_id"], u["password"], u["agency_id"], u["role"], u["display_name"], u["credit_limit"]),
            )
        for item in _SEED_INVENTORY:
            self._conn.execute(
                "INSERT INTO inventory (item_id, type, city, title, unit_fare, currency) VALUES (?, ?, ?, ?, ?, ?);",
                (item["item_id"], item["type"], item["city"], item["title"], item["unit_fare"], item["currency"]),
            )
        for c in _SEED_COUPONS:
            self._conn.execute("INSERT INTO coupons (code, discount_amount) VALUES (?, ?);", (c["code"], c["discount_amount"]))
        for h in _SEED_HOLDS:
            self._conn.execute(
                """
                INSERT INTO holds (hold_id, agency_id, item_id, quantity, quoted_fare, discount_applied, applied_coupons)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (h["hold_id"], h["agency_id"], h["item_id"], h["quantity"], h["quoted_fare"], h["discount_applied"], json.dumps(h["applied_coupons"])),
            )
        for b in _SEED_BOOKINGS:
            self._conn.execute(
                """
                INSERT INTO bookings (
                    booking_id, agency_id, created_by, hold_id, item_id, quantity,
                    total_fare, paid_amount, refunded_amount, payment_status, status,
                    voucher_code, traveller_name, traveller_passport, traveller_email
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    b["booking_id"], b["agency_id"], b["created_by"], b["hold_id"], b["item_id"],
                    b["quantity"], b["total_fare"], b["paid_amount"], b["refunded_amount"],
                    b["payment_status"], b["status"], b["voucher_code"], b["traveller_name"],
                    b["traveller_passport"], b["traveller_email"],
                ),
            )
        self._conn.commit()

    def reset(self, version: VersionLiteral | None = None) -> VersionLiteral:
        with self._lock:
            ver = version or self._get_version_unlocked()
            self._seed_all(ver)
            return ver

    def _get_version_unlocked(self) -> VersionLiteral:
        row = self._conn.execute("SELECT value FROM sim_meta WHERE key = 'version';").fetchone()
        val = row["value"] if row else "v1.0"
        return val if val in ("v1.0", "v1.1", "v1.2") else "v1.0"

    def get_version(self) -> VersionLiteral:
        with self._lock:
            return self._get_version_unlocked()

    def set_version(self, version: VersionLiteral) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO sim_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                (version,),
            )
            self._conn.commit()

    def get_user(self, username: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM users WHERE username = ?;", (username,)).fetchone()
            return dict(row) if row else None

    def update_user_fields(self, username: str, updates: dict[str, Any]) -> dict[str, Any]:
        allowed_cols = {"display_name", "role", "credit_limit"}
        clean = {k: v for k, v in updates.items() if k in allowed_cols}
        with self._lock:
            if clean:
                set_clause = ", ".join(f"{col} = ?" for col in clean)
                self._conn.execute(f"UPDATE users SET {set_clause} WHERE username = ?;", (*clean.values(), username))
                self._conn.commit()
            row = self._conn.execute("SELECT * FROM users WHERE username = ?;", (username,)).fetchone()
            return dict(row) if row else {}

    def add_revoked_token(self, token: str) -> None:
        with self._lock:
            self._conn.execute("INSERT OR IGNORE INTO revoked_tokens (token) VALUES (?);", (token,))
            self._conn.commit()

    def is_token_revoked(self, token: str) -> bool:
        with self._lock:
            row = self._conn.execute("SELECT 1 FROM revoked_tokens WHERE token = ?;", (token,)).fetchone()
            return row is not None

    def list_inventory(self, city: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM inventory ORDER BY item_id;").fetchall()
            items = [dict(r) for r in rows]
        if city:
            items = [i for i in items if city.lower() in i["city"].lower()]
        return items

    def get_inventory(self, item_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM inventory WHERE item_id = ?;", (item_id,)).fetchone()
            return dict(row) if row else None

    def get_coupon(self, code: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM coupons WHERE code = ?;", (code,)).fetchone()
            return dict(row) if row else None

    @staticmethod
    def _row_to_hold(row: sqlite3.Row) -> dict[str, Any]:
        d = dict(row)
        d["applied_coupons"] = json.loads(d["applied_coupons"])
        return d

    def create_hold(self, hold: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO holds (hold_id, agency_id, item_id, quantity, quoted_fare, discount_applied, applied_coupons)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    hold["hold_id"], hold["agency_id"], hold["item_id"], hold["quantity"],
                    hold["quoted_fare"], hold["discount_applied"], json.dumps(hold["applied_coupons"]),
                ),
            )
            self._conn.commit()
        return hold

    def get_hold(self, hold_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM holds WHERE hold_id = ?;", (hold_id,)).fetchone()
            return self._row_to_hold(row) if row else None

    def list_holds_by_agency(self, agency_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM holds WHERE agency_id = ?;", (agency_id,)).fetchall()
            return [self._row_to_hold(r) for r in rows]

    def update_hold(self, hold: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                """
                UPDATE holds SET quoted_fare = ?, discount_applied = ?, applied_coupons = ?
                WHERE hold_id = ?;
                """,
                (hold["quoted_fare"], hold["discount_applied"], json.dumps(hold["applied_coupons"]), hold["hold_id"]),
            )
            self._conn.commit()
        return hold

    def create_booking(self, b: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO bookings (
                    booking_id, agency_id, created_by, hold_id, item_id, quantity,
                    total_fare, paid_amount, refunded_amount, payment_status, status,
                    voucher_code, traveller_name, traveller_passport, traveller_email
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    b["booking_id"], b["agency_id"], b["created_by"], b["hold_id"], b["item_id"],
                    b["quantity"], b["total_fare"], b["paid_amount"], b["refunded_amount"],
                    b["payment_status"], b["status"], b["voucher_code"], b["traveller_name"],
                    b["traveller_passport"], b["traveller_email"],
                ),
            )
            self._conn.commit()
        return b

    def get_booking(self, booking_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM bookings WHERE booking_id = ?;", (booking_id,)).fetchone()
            return dict(row) if row else None

    def list_bookings_by_agency(self, agency_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM bookings WHERE agency_id = ? ORDER BY rowid DESC;", (agency_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def list_all_bookings(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM bookings ORDER BY rowid ASC;").fetchall()
            return [dict(r) for r in rows]

    def update_booking(self, b: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                """
                UPDATE bookings
                SET paid_amount = ?, refunded_amount = ?, payment_status = ?, status = ?, voucher_code = ?
                WHERE booking_id = ?;
                """,
                (b["paid_amount"], b["refunded_amount"], b["payment_status"], b["status"], b["voucher_code"], b["booking_id"]),
            )
            self._conn.commit()
        return b

    def close(self) -> None:
        with self._lock:
            self._conn.close()
