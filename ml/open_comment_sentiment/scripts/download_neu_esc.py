from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DESTINATION = PROJECT_ROOT / "data" / "raw" / "neu_esc"
SOURCE_CONFIG = PROJECT_ROOT / "config" / "data-sources.json"
BASE_URL = "https://huggingface.co/datasets/hung20gg/NEU-ESC/resolve"
DATASET_PAGE = "https://huggingface.co/datasets/hung20gg/NEU-ESC"

GATED_HELP = (
    "Hugging Face refused the download (HTTP {code}).\n"
    "NEU-ESC is a gated dataset (`gated: auto`): the file names are public but the content is not.\n"
    "Steps:\n"
    f"  1. Log in at {DATASET_PAGE} and accept the dataset conditions.\n"
    "  2. Authenticate locally, either way works:\n"
    "       huggingface-cli login          # writes ~/.cache/huggingface/token\n"
    "       $env:HF_TOKEN = '<token>'      # PowerShell alternative\n"
    "  3. Re-run: python scripts/download_neu_esc.py\n"
    "The token is only read locally and is never copied into the dataset folder or Git."
)


class GatedAccessError(RuntimeError):
    """Raised when Hugging Face requires accepted conditions before download."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the gated NEU-ESC dataset files at the pinned revision."
    )
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument(
        "--revision",
        help="Dataset revision to download; defaults to neu_esc.revision_pinned in config/data-sources.json",
    )
    parser.add_argument(
        "--token",
        help=(
            "Hugging Face access token. Defaults to HF_TOKEN, HUGGING_FACE_HUB_TOKEN, "
            "or the token written by `huggingface-cli login`."
        ),
    )
    parser.add_argument("--force", action="store_true", help="Re-download files that already exist")
    return parser.parse_args()


def load_source_config() -> dict[str, object]:
    return json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))["neu_esc"]  # type: ignore[return-value]


def expected_files(config: dict[str, object]) -> list[str]:
    files = list(config["files"].values())  # type: ignore[union-attr]
    card = config.get("dataset_card_file")
    if card:
        files.append(card)
    return sorted(set(files))


def token_file_candidates() -> list[Path]:
    """Locations used by `huggingface-cli login` / `hf auth login`."""
    candidates: list[Path] = []
    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        candidates.append(Path(hf_home) / "token")
    candidates.append(Path.home() / ".cache" / "huggingface" / "token")
    candidates.append(Path.home() / ".huggingface" / "token")
    return candidates


def resolve_token(explicit: str | None) -> tuple[str | None, str | None]:
    """Return `(token, source)`; the token value itself is never logged."""
    if explicit:
        return explicit.strip(), "--token"
    for name in ("HF_TOKEN", "HUGGINGFACE_HUB_TOKEN"):
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip(), name
    for path in token_file_candidates():
        if path.is_file():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value, str(path)
    return None, None


def fetch(url: str, token: str | None) -> bytes:
    headers = {"User-Agent": "khaosatvmu-offline-dataset-audit/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urlopen(Request(url, headers=headers), timeout=180) as response:
            return response.read()
    except HTTPError as error:
        if error.code in (401, 403):
            raise GatedAccessError(GATED_HELP.format(code=error.code)) from error
        raise
    except URLError as error:
        raise RuntimeError(f"Cannot reach Hugging Face: {error.reason}") from error


def main() -> int:
    args = parse_args()
    config = load_source_config()
    revision = args.revision or str(config["revision_pinned"])
    token, token_source = resolve_token(args.token)

    if token is None:
        print(
            "No Hugging Face token found. NEU-ESC is gated, so the download will fail.\n"
            "Run `huggingface-cli login` after accepting the conditions at "
            f"{DATASET_PAGE}, or set HF_TOKEN.\n",
            file=sys.stderr,
        )
    else:
        print(f"Using Hugging Face token from: {token_source}")

    destination = args.destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)

    downloaded: list[str] = []
    try:
        for filename in expected_files(config):
            target = destination / filename
            if target.exists() and not args.force:
                continue
            content = fetch(f"{BASE_URL}/{revision}/{filename}?download=true", token)
            target.write_bytes(content)
            downloaded.append(filename)
            print(f"Downloaded {filename}: {len(content)} bytes")
    except GatedAccessError as error:
        print(error.args[0], file=sys.stderr)
        return 2

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": config["official_dataset"],
        "revision_downloaded": revision,
        "license": config["license"],
        "license_source": config["license_source"],
        "access_requirement": config["access_requirement"],
        "gated": config["gated"],
        "downloaded_now": downloaded,
        "files": {
            filename: {
                "bytes": (destination / filename).stat().st_size,
                "sha256": hashlib.sha256((destination / filename).read_bytes()).hexdigest(),
            }
            for filename in expected_files(config)
            if (destination / filename).is_file()
        },
    }
    (destination / "download-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"NEU-ESC ready at {destination}; downloaded {len(downloaded)} new file(s) at revision {revision}.")
    print(f"Checksums recorded in {destination / 'download-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
