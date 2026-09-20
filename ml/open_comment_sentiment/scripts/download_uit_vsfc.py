from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import gdown


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DESTINATION = PROJECT_ROOT / "data" / "raw" / "uit_vsfc"
SOURCE_CONFIG = PROJECT_ROOT / "config" / "data-sources.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download UIT-VSFC from the official UIT Google Drive folder.")
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    destination = args.destination.resolve()
    config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))["uit_vsfc"]

    if config["allowed_stage"] != "offline-research-evaluation-only":
        raise RuntimeError("Dataset policy must explicitly restrict this download to offline evaluation")

    existing = list(destination.rglob("sents.txt")) if destination.exists() else []
    if existing:
        print(f"Dataset already exists at {destination}; download skipped.")
        return 0

    destination.mkdir(parents=True, exist_ok=True)
    url = f"https://drive.google.com/drive/folders/{config['download_folder_id']}"
    downloaded = gdown.download_folder(
        url=url,
        output=str(destination),
        quiet=False,
        use_cookies=False,
        remaining_ok=False,
    )
    if not downloaded:
        print("No files were downloaded", file=sys.stderr)
        return 1

    print(f"Downloaded {len(downloaded)} files to {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
