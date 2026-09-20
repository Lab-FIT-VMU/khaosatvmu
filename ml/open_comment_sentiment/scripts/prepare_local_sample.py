from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import random
import re
import sys
import unicodedata


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "processed" / "local-gold-sample.csv"

EMAIL_PATTERN = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
URL_PATTERN = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.()-]*\d){8,10}(?!\d)")


def normalize_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).strip().split())


def mask_direct_identifiers(value: str) -> str:
    value = EMAIL_PATTERN.sub("[EMAIL]", value)
    value = URL_PATTERN.sub("[URL]", value)
    return PHONE_PATTERN.sub("[PHONE]", value)


def length_bucket(text: str) -> str:
    length = len(text.split())
    if length <= 5:
        return "short"
    if length <= 20:
        return "medium"
    return "long"


def diverse_sample(rows: list[dict[str, str]], sample_size: int, seed: int) -> list[dict[str, str]]:
    rng = random.Random(seed)
    buckets: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        buckets[(row["SourceGroup"], length_bucket(row["Text"]))].append(row)
    queues: list[deque[dict[str, str]]] = []
    for key in sorted(buckets):
        rng.shuffle(buckets[key])
        queues.append(deque(buckets[key]))
    rng.shuffle(queues)

    selected: list[dict[str, str]] = []
    while queues and len(selected) < min(sample_size, len(rows)):
        remaining: list[deque[dict[str, str]]] = []
        for queue in queues:
            if queue and len(selected) < sample_size:
                selected.append(queue.popleft())
            if queue:
                remaining.append(queue)
        queues = remaining
    return selected


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare an anonymized, diverse local annotation sample.")
    parser.add_argument("--input", type=Path, required=True, help="Authorized CSV export; never committed to Git")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--text-column", default="AdditionalComments")
    parser.add_argument("--group-column", help="Optional survey period/semester column used for diverse sampling")
    parser.add_argument("--sample-size", type=int, default=400)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.sample_size <= 0:
        raise ValueError("--sample-size must be positive")
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    if output_path.exists() and not args.overwrite:
        raise FileExistsError(f"Output already exists: {output_path}. Use --overwrite explicitly to replace it.")

    prepared: list[dict[str, str]] = []
    seen: set[str] = set()
    with input_path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or args.text_column not in reader.fieldnames:
            raise ValueError(f"Missing text column {args.text_column!r}; available columns: {reader.fieldnames}")
        if args.group_column and args.group_column not in reader.fieldnames:
            raise ValueError(f"Missing group column {args.group_column!r}; available columns: {reader.fieldnames}")
        for row in reader:
            text = mask_direct_identifiers(normalize_text(row.get(args.text_column, "")))
            key = text.casefold()
            if not text or key in seen:
                continue
            seen.add(key)
            prepared.append(
                {
                    "Text": text,
                    "SourceGroup": normalize_text(row.get(args.group_column, "")) if args.group_column else "unspecified",
                }
            )

    selected = diverse_sample(prepared, args.sample_size, args.seed)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["SampleId", "Text", "SourceGroup", "LengthBucket", "Sentiment", "NeedsAdjudication", "AnnotatorNotes"]
    with output_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        for index, row in enumerate(selected, start=1):
            writer.writerow(
                {
                    "SampleId": f"LOCAL-{index:04d}",
                    "Text": row["Text"],
                    "SourceGroup": row["SourceGroup"],
                    "LengthBucket": length_bucket(row["Text"]),
                    "Sentiment": "",
                    "NeedsAdjudication": "",
                    "AnnotatorNotes": "",
                }
            )

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_filename": input_path.name,
        "output_filename": output_path.name,
        "seed": args.seed,
        "requested_sample_size": args.sample_size,
        "eligible_unique_rows": len(prepared),
        "selected_rows": len(selected),
        "length_distribution": dict(sorted(Counter(length_bucket(row["Text"]) for row in selected).items())),
        "source_group_count": len(set(row["SourceGroup"] for row in selected)),
        "direct_identifier_masking": ["email", "url", "phone"],
        "contains_original_response_id": False,
    }
    manifest_path = output_path.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if len(selected) < args.sample_size:
        print("Warning: eligible data is smaller than the requested sample size", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
