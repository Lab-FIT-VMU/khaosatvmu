from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.data import EXPECTED_FILES, load_official_splits, sha256_file  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit UIT-VSFC files and official splits.")
    parser.add_argument("--data-dir", type=Path, default=PROJECT_ROOT / "data" / "raw" / "uit_vsfc")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "artifacts" / "dataset-audit.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    splits = load_official_splits(args.data_dir.resolve())

    locations: dict[str, list[str]] = defaultdict(list)
    for split_name, split in splits.items():
        for text in split.texts:
            locations[text.casefold()].append(split_name)

    cross_split_duplicates = {
        text: names for text, names in locations.items() if len(set(names)) > 1
    }
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "UIT-VSFC v1.0 official Google Drive",
        "license_status": "unverified-no-license-file",
        "usage_restriction": "offline-research-evaluation-only",
        "splits": {},
        "cross_split_duplicate_text_count": len(cross_split_duplicates),
        "cross_split_duplicate_examples": [
            {"text": text, "splits": names}
            for text, names in list(cross_split_duplicates.items())[:20]
        ],
    }
    for split_name, split in splits.items():
        hashes = {
            filename: sha256_file(split.directory / filename)
            for filename in EXPECTED_FILES
        }
        report["splits"][split_name] = {
            "rows": len(split.texts),
            "label_distribution": dict(sorted(Counter(split.labels).items())),
            "empty_text_count": sum(not text for text in split.texts),
            "unique_text_count": len(set(text.casefold() for text in split.texts)),
            "files_sha256": hashes,
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
