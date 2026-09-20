"""Offline loader for the NEU-ESC educational sentiment corpus.

The three-class task of phase 1 only uses `Neutral`, `Positive` and `Negative`.
The `Toxic` label of NEU-ESC is deliberately dropped instead of being folded into
`Negative`; the loader only reports how many rows were dropped so the audit can
show the exclusion without keeping the text.

The loader never reaches the network. The gated CSV files must be placed in
`data/raw/neu_esc` by `scripts/download_neu_esc.py` or by a manual download.
"""

from __future__ import annotations

from dataclasses import dataclass
import csv
import re
from pathlib import Path

from .data import DatasetUnavailableError, normalize_text


LABEL_NAMES = ("Negative", "Neutral", "Positive")

# Codes published in the NEU-ESC dataset card: 0=Neutral, 1=Positive,
# 2=Negative, 3=Toxic. Note the order differs from UIT-VSFC on purpose.
SENTIMENT_MAPPING = {"0": "Neutral", "1": "Positive", "2": "Negative"}
EXCLUDED_SENTIMENT_MAPPING = {"3": "Toxic"}

SPLIT_FILENAMES = {"train": "train_set.csv", "val": "val_set.csv", "test": "test_set.csv"}
EXPECTED_SPLITS = ("train", "val", "test")

TEXT_COLUMN_CANDIDATES = ("Text", "text", "Sentence", "Comment", "Content")
SENTIMENT_COLUMN_CANDIDATES = ("Sentiment", "sentiment", "Label", "label", "SentimentLabel")
TOPIC_COLUMN_CANDIDATES = ("Classification", "classification", "Topic", "topic")

_TRAILING_INTEGER_SUFFIX = re.compile(r"^(\d+)\.0$")


@dataclass(frozen=True)
class NeuEscSplit:
    """One NEU-ESC split after label harmonisation."""

    name: str
    path: Path
    columns: dict[str, str]
    texts: list[str]
    labels: list[str]
    topics: list[str]
    rows_read: int
    rows_kept: int
    excluded_label_counts: dict[str, int]
    skipped_empty_text: int

    def __post_init__(self) -> None:
        if not (len(self.texts) == len(self.labels) == len(self.topics)):
            raise ValueError(
                f"Split {self.name!r} has inconsistent row counts: "
                f"texts={len(self.texts)}, labels={len(self.labels)}, topics={len(self.topics)}"
            )
        invalid = sorted(set(self.labels) - set(LABEL_NAMES))
        if invalid:
            raise ValueError(f"Split {self.name!r} has invalid labels after mapping: {invalid}")

    @property
    def excluded_rows(self) -> int:
        return sum(self.excluded_label_counts.values())


def dataset_unavailable_message(root: Path) -> str:
    expected = ", ".join(sorted(SPLIT_FILENAMES.values()))
    return (
        f"NEU-ESC CSV files were not found under {root} (expected: {expected}).\n"
        "NEU-ESC is a gated Hugging Face dataset: log in, accept the dataset conditions at\n"
        "https://huggingface.co/datasets/hung20gg/NEU-ESC, then either\n"
        "  1) set the HF_TOKEN environment variable and run\n"
        "     python scripts/download_neu_esc.py\n"
        "  2) or download train_set.csv, val_set.csv, test_set.csv manually into that folder.\n"
        "No placeholder or synthetic text is used, because phase 1 requires audited real data."
    )


def _canonical_code(value: str) -> str:
    """Accept ``2`` and ``2.0`` because pandas exports may add a decimal part."""
    stripped = value.strip()
    match = _TRAILING_INTEGER_SUFFIX.match(stripped)
    return match.group(1) if match else stripped


def resolve_column(fieldnames: list[str], candidates: tuple[str, ...], role: str, path: Path) -> str:
    normalized = {name.strip().casefold(): name for name in fieldnames if name}
    for candidate in candidates:
        if candidate.casefold() in normalized:
            return normalized[candidate.casefold()]
    raise ValueError(
        f"Missing {role} column in {path.name}; detected columns: {fieldnames}. "
        f"Accepted names: {list(candidates)}"
    )


def resolve_sentiment(raw_value: str) -> tuple[str | None, str | None]:
    """Return ``(three_class_label, excluded_label)`` for one raw sentiment value.

    Exactly one element of the tuple is set. Unknown values raise so a silent
    label shift cannot enter the training corpus.
    """
    code = _canonical_code(raw_value)
    if code in SENTIMENT_MAPPING:
        return SENTIMENT_MAPPING[code], None
    if code in EXCLUDED_SENTIMENT_MAPPING:
        return None, EXCLUDED_SENTIMENT_MAPPING[code]

    folded = code.casefold()
    for label in LABEL_NAMES:
        if label.casefold() == folded:
            return label, None
    for excluded in EXCLUDED_SENTIMENT_MAPPING.values():
        if excluded.casefold() == folded:
            return None, excluded

    known = sorted(SENTIMENT_MAPPING) + sorted(EXCLUDED_SENTIMENT_MAPPING)
    raise ValueError(
        f"Unknown NEU-ESC sentiment value {raw_value!r}. Known codes: {known}; "
        f"known names: {sorted(LABEL_NAMES + tuple(EXCLUDED_SENTIMENT_MAPPING.values()))}"
    )


def _read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing NEU-ESC file: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = [name for name in (reader.fieldnames or []) if name and name.strip()]
        rows = [
            {key: (value or "") for key, value in row.items() if key}
            for row in reader
            if any((value or "").strip() for value in row.values())
        ]
    return fieldnames, rows


def load_split(path: Path, split_name: str) -> NeuEscSplit:
    """Load one NEU-ESC CSV split and map labels onto the three-class task."""
    path = Path(path)
    fieldnames, rows = _read_rows(path)
    if not fieldnames:
        raise ValueError(f"NEU-ESC file {path.name} has no header row")

    text_column = resolve_column(fieldnames, TEXT_COLUMN_CANDIDATES, "text", path)
    sentiment_column = resolve_column(fieldnames, SENTIMENT_COLUMN_CANDIDATES, "sentiment", path)
    topic_column = resolve_column(fieldnames, TOPIC_COLUMN_CANDIDATES, "topic", path)

    texts: list[str] = []
    labels: list[str] = []
    topics: list[str] = []
    excluded: dict[str, int] = {}
    skipped_empty_text = 0

    for row in rows:
        label, excluded_label = resolve_sentiment(row.get(sentiment_column, ""))
        if excluded_label is not None:
            excluded[excluded_label] = excluded.get(excluded_label, 0) + 1
            continue
        text = normalize_text(row.get(text_column, ""))
        if not text:
            skipped_empty_text += 1
            continue
        texts.append(text)
        labels.append(label)  # type: ignore[arg-type]
        topics.append(normalize_text(row.get(topic_column, "")))

    if not texts:
        raise ValueError(f"NEU-ESC split {split_name!r} has no usable rows in {path.name}")

    return NeuEscSplit(
        name=split_name,
        path=path,
        columns={"text": text_column, "sentiment": sentiment_column, "topic": topic_column},
        texts=texts,
        labels=labels,
        topics=topics,
        rows_read=len(rows),
        rows_kept=len(texts),
        excluded_label_counts=dict(sorted(excluded.items())),
        skipped_empty_text=skipped_empty_text,
    )


def load_all_splits(root: Path) -> dict[str, NeuEscSplit]:
    root = Path(root)
    missing = [filename for filename in SPLIT_FILENAMES.values() if not (root / filename).is_file()]
    if missing:
        raise DatasetUnavailableError(dataset_unavailable_message(root))
    return {
        split: load_split(root / filename, split)
        for split, filename in SPLIT_FILENAMES.items()
    }
