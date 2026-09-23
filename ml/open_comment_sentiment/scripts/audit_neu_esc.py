from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402
from sentiment_baseline.data import DatasetUnavailableError, sha256_file  # noqa: E402
from sentiment_baseline.neu_esc import (  # noqa: E402
    EXPECTED_SPLITS,
    SPLIT_FILENAMES,
    load_all_splits,
)

SOURCE_CONFIG = PROJECT_ROOT / "config" / "data-sources.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit the NEU-ESC educational sentiment corpus.")
    parser.add_argument("--data-dir", type=Path, default=PROJECT_ROOT / "data" / "raw" / "neu_esc")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "artifacts" / "neu-esc-audit.json")
    return parser.parse_args()


def fingerprint(text: str) -> str:
    """Hashes are stored instead of raw comments so artifacts stay text-free."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def main() -> int:
    force_utf8_output()
    args = parse_args()
    data_dir = args.data_dir.resolve()
    config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))
    source_config = config["neu_esc"]

    try:
        splits = load_all_splits(data_dir)
    except DatasetUnavailableError as error:
        print(error.args[0], file=sys.stderr)
        return 2

    locations: dict[str, list[str]] = defaultdict(list)
    train_keys: set[str] = set()
    for split_name, split in splits.items():
        for text in split.texts:
            locations[text.casefold()].append(split_name)
            if split_name == "train":
                train_keys.add(text.casefold())

    cross_split_duplicates = {key: names for key, names in locations.items() if len(set(names)) > 1}
    train_overlap = {
        split_name: sum(
            1 for text in split.texts if text.casefold() in train_keys
        )
        for split_name, split in splits.items()
        if split_name != "train"
    }

    report: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "NEU-ESC (Hugging Face hung20gg/NEU-ESC)",
        "license": source_config["license"],
        "license_source": source_config["license_source"],
        "license_note": source_config["license_note"],
        "access": {
            "gated": source_config["gated"],
            "requirement": source_config["access_requirement"],
            "revision_pinned": source_config["revision_pinned"],
            "last_modified_utc": source_config["last_modified_utc"],
        },
        "task": {
            "classes": list(config["task_labels"]["classes"]),
            "derived_labels": list(config["task_labels"]["derived_labels"]),
            "excluded_source_labels": source_config["excluded_sentiment_labels"],
            "exclusion_policy": config["task_labels"]["exclusion_policy"],
        },
        "source_label_mapping": source_config["sentiment_mapping"],
        "data_dir": str(data_dir),
        "splits": {},
        "cross_split_duplicate_text_count": len(cross_split_duplicates),
        "cross_split_duplicate_fingerprints": sorted(
            fingerprint(key) for key in list(cross_split_duplicates)[:20]
        ),
        "train_overlap_rows_in_eval_splits": train_overlap,
    }

    for split_name in EXPECTED_SPLITS:
        split = splits[split_name]
        report["splits"][split_name] = {
            "file": SPLIT_FILENAMES[split_name],
            "columns_used": split.columns,
            "rows_read": split.rows_read,
            "rows_kept": split.rows_kept,
            "rows_excluded_by_label": split.excluded_label_counts,
            "rows_excluded_total": split.excluded_rows,
            "rows_skipped_empty_text": split.skipped_empty_text,
            "label_distribution": dict(sorted(Counter(split.labels).items())),
            "topic_distribution": dict(sorted(Counter(split.topics).items())),
            "unique_text_count": len(set(text.casefold() for text in split.texts)),
            "internal_duplicate_count": split.rows_kept - len(set(text.casefold() for text in split.texts)),
            "average_characters": round(sum(len(text) for text in split.texts) / split.rows_kept, 1),
            "file_sha256": sha256_file(split.path),
        }

    total_kept = sum(split.rows_kept for split in splits.values())
    total_excluded = sum(split.excluded_rows for split in splits.values())
    report["totals"] = {
        "rows_kept": total_kept,
        "rows_excluded_by_label": total_excluded,
        "label_distribution": dict(sorted(Counter(
            label for split in splits.values() for label in split.labels
        ).items())),
    }

    manifest_path = data_dir / "download-manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        recorded = manifest.get("files", {})
        mismatches = [
            filename
            for filename, values in recorded.items()
            if (data_dir / filename).is_file()
            and values.get("sha256") != sha256_file(data_dir / filename)
        ]
        report["download_manifest"] = {
            "present": True,
            "revision_downloaded": manifest.get("revision_downloaded"),
            "revision_matches_config": manifest.get("revision_downloaded") == source_config["revision_pinned"],
            "checksum_mismatches": mismatches,
            "checksums_match": not mismatches,
        }
    else:
        report["download_manifest"] = {
            "present": False,
            "note": "Không thấy download-manifest.json; checksum chỉ được tính lại từ file local.",
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nAudit written to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
