"""The schema is written down three times; these keep the copies honest.

`app/db/models.py` is the source of truth, `migrations/versions/*` upgrades a
live DB, and `db/init/001_initial_schema.sql` bootstraps the docker-compose one
from scratch. Nothing forces the last of these to keep up -- a column added to
the models and the migration but not the SQL leaves compose users with a schema
that is silently a version behind.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.db.base import Base

REPO_ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP_SQL = REPO_ROOT / "db" / "init" / "001_initial_schema.sql"
MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations" / "versions"


@pytest.fixture(scope="module")
def bootstrap_sql() -> str:
    return BOOTSTRAP_SQL.read_text()


def test_every_model_table_is_in_the_bootstrap_sql(bootstrap_sql: str):
    missing = [
        name
        for name in Base.metadata.tables
        if f"CREATE TABLE IF NOT EXISTS {name}" not in bootstrap_sql
    ]
    assert not missing, f"tables missing from {BOOTSTRAP_SQL.name}: {missing}"


def test_every_model_column_is_in_the_bootstrap_sql(bootstrap_sql: str):
    # Split the file into per-table blocks so a column name can't be matched
    # against some unrelated table that happens to have the same one.
    blocks = {
        match.group(1): match.group(2)
        for match in re.finditer(
            r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", bootstrap_sql, re.S
        )
    }
    missing: list[str] = []
    for name, table in Base.metadata.tables.items():
        block = blocks.get(name, "")
        missing += [
            f"{name}.{col.name}"
            for col in table.columns
            if not re.search(rf"^\s*{col.name}\s", block, re.M)
        ]
    assert not missing, f"columns missing from {BOOTSTRAP_SQL.name}: {missing}"


def test_bootstrap_sql_stamps_the_latest_migration(bootstrap_sql: str):
    """Otherwise `make migrate` re-runs a migration against a DB that has it."""
    revisions = {
        match.group(1)
        for path in MIGRATIONS.glob("*.py")
        for match in [re.search(r'^revision: str = "(.+)"', path.read_text(), re.M)]
        if match
    }
    down = {
        match.group(1)
        for path in MIGRATIONS.glob("*.py")
        for match in [
            re.search(r'^down_revision: .* = "(.+)"', path.read_text(), re.M)
        ]
        if match
    }
    head = revisions - down  # the revision nothing else builds on
    assert len(head) == 1, f"expected a single migration head, got {head}"

    stamped = re.search(r"INSERT INTO alembic_version .* VALUES \('(.+?)'\)", bootstrap_sql)
    assert stamped is not None, "bootstrap SQL does not stamp alembic_version"
    assert stamped.group(1) == head.pop()
