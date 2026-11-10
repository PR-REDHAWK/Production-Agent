"""Immutable append-only audit logger (JSONL + SQLite WAL)."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from safety.models import AuditRecord, SafetyConfigError


class AuditLogger:
    """Appends every allowed or blocked HTTP request to JSONL and SQLite.

    Audit entries are strictly append-only; no update or delete methods exist.
    """

    def __init__(self, jsonl_path: Path, sqlite_path: Path) -> None:
        self._lock = threading.Lock()
        self.jsonl_path = Path(jsonl_path)
        self.sqlite_path = Path(sqlite_path)
        try:
            self.jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        trace_id TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        agent TEXT NOT NULL,
                        actor TEXT NOT NULL,
                        method TEXT NOT NULL,
                        url TEXT NOT NULL,
                        sanitized_headers TEXT NOT NULL,
                        body TEXT NOT NULL,
                        status INTEGER NOT NULL,
                        latency_ms REAL NOT NULL,
                        body_excerpt TEXT NOT NULL,
                        decision TEXT NOT NULL,
                        metadata TEXT NOT NULL
                    );
                    """
                )
                conn.commit()
        except Exception as exc:  # noqa: BLE001
            raise SafetyConfigError(f"Failed to initialize audit store: {exc}") from exc

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.sqlite_path), timeout=10.0)

    def append(self, record: AuditRecord) -> None:
        line = record.model_dump_json()
        with self._lock:
            with self.jsonl_path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO audit_logs (
                        trace_id, timestamp, agent, actor, method, url,
                        sanitized_headers, body, status, latency_ms,
                        body_excerpt, decision, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        record.trace_id,
                        record.timestamp,
                        record.agent,
                        record.actor,
                        record.method,
                        record.url,
                        json.dumps(record.sanitized_headers),
                        record.body,
                        record.status,
                        record.latency_ms,
                        record.body_excerpt,
                        record.decision,
                        json.dumps(record.metadata),
                    ),
                )
                conn.commit()

    def count_entries(self) -> int:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT COUNT(*) FROM audit_logs;").fetchone()
                return int(row[0]) if row else 0

    def read_recent(self, limit: int = 50) -> list[AuditRecord]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT trace_id, timestamp, agent, actor, method, url,
                           sanitized_headers, body, status, latency_ms,
                           body_excerpt, decision, metadata
                    FROM audit_logs
                    ORDER BY id DESC
                    LIMIT ?;
                    """,
                    (limit,),
                ).fetchall()
        results: list[AuditRecord] = []
        for row in rows:
            results.append(
                AuditRecord(
                    trace_id=row[0],
                    timestamp=row[1],
                    agent=row[2],
                    actor=row[3],
                    method=row[4],
                    url=row[5],
                    sanitized_headers=json.loads(row[6]),
                    body=row[7],
                    status=int(row[8]),
                    latency_ms=float(row[9]),
                    body_excerpt=row[10],
                    decision=row[11],
                    metadata=json.loads(row[12]),
                )
            )
        return results
