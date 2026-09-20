from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import unicodedata


LABEL_NAMES = ("Negative", "Neutral", "Positive")
LABEL_MAPPING = {"0": "Negative", "1": "Neutral", "2": "Positive"}
EXPECTED_SPLITS = ("train", "dev", "test")
EXPECTED_FILES = ("sents.txt", "sentiments.txt", "topics.txt")


class DatasetUnavailableError(RuntimeError):
    """Raised when an audited dataset is not present locally yet."""


@dataclass(frozen=True)
class DatasetSplit:
    name: str
    texts: list[str]
    labels: list[str]
    topics: list[str]
    directory: Path

    def __post_init__(self) -> None:
        if not (len(self.texts) == len(self.labels) == len(self.topics)):
            raise ValueError(
                f"Split {self.name!r} has inconsistent row counts: "
                f"texts={len(self.texts)}, labels={len(self.labels)}, topics={len(self.topics)}"
            )
        if not self.texts:
            raise ValueError(f"Split {self.name!r} is empty")
        invalid = sorted(set(self.labels) - set(LABEL_NAMES))
        if invalid:
            raise ValueError(f"Split {self.name!r} has invalid labels: {invalid}")


def normalize_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).strip().split())


def _read_lines(path: Path) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing dataset file: {path}")
    return path.read_text(encoding="utf-8-sig").splitlines()


def find_split_directory(root: Path, split: str) -> Path:
    candidates = [
        path.parent
        for path in root.rglob("sents.txt")
        if path.parent.name.casefold() == split.casefold()
    ]
    if len(candidates) != 1:
        raise ValueError(
            f"Expected exactly one {split!r} directory under {root}, found {len(candidates)}: {candidates}"
        )
    return candidates[0]


def load_split(root: Path, split: str) -> DatasetSplit:
    directory = find_split_directory(root, split)
    texts = [normalize_text(value) for value in _read_lines(directory / "sents.txt")]
    raw_labels = [value.strip() for value in _read_lines(directory / "sentiments.txt")]
    try:
        labels = [LABEL_MAPPING[value] for value in raw_labels]
    except KeyError as error:
        raise ValueError(f"Unknown sentiment label {error.args[0]!r} in split {split!r}") from error
    topics = [value.strip() for value in _read_lines(directory / "topics.txt")]
    return DatasetSplit(split, texts, labels, topics, directory)


def load_official_splits(root: Path) -> dict[str, DatasetSplit]:
    return {split: load_split(root, split) for split in EXPECTED_SPLITS}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
