from __future__ import annotations

import argparse
import csv
import io
from pathlib import Path
import subprocess


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "raw" / "local" / "local-comments.csv"

SQL = r"""
COPY (
    SELECT btrim("AdditionalComments") AS "AdditionalComments",
           to_char("SubmittedAt", 'YYYY-MM') AS "SurveyPeriod",
           "IsValid"
    FROM "SurveyResponses"
    WHERE NOT "IsDeleted"
      AND "AdditionalComments" IS NOT NULL
      AND btrim("AdditionalComments") <> ''
    ORDER BY "SubmittedAt", "ResponseId"
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE);
"""


def docker_env(container: str, key: str) -> str:
    result = subprocess.run(
        ["docker", "exec", container, "printenv", key],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"Container {container!r} does not expose {key}")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read-only export of local open comments from PostgreSQL Docker.")
    parser.add_argument("--container", default="khaosatvmu_db")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.resolve()
    if output.exists() and not args.overwrite:
        raise FileExistsError(f"Output already exists: {output}. Use --overwrite explicitly to replace it.")

    user = docker_env(args.container, "POSTGRES_USER")
    database = docker_env(args.container, "POSTGRES_DB")
    command = [
        "docker",
        "exec",
        "-i",
        "-e",
        "PGOPTIONS=-c default_transaction_read_only=on",
        args.container,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-qAt",
        "-U",
        user,
        "-d",
        database,
    ]
    result = subprocess.run(
        command,
        input=SQL,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    rows = list(csv.DictReader(io.StringIO(result.stdout)))
    expected_columns = {"AdditionalComments", "SurveyPeriod", "IsValid"}
    if rows and set(rows[0]) != expected_columns:
        raise RuntimeError(f"Unexpected export columns: {set(rows[0])}")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result.stdout, encoding="utf-8-sig")
    print(f"Exported {len(rows)} comments to {output}; no response IDs or scores were exported.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
