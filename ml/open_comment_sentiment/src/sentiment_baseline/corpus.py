"""Build a reproducible three-class corpus from one or more sources.

Phase 1 decision: NEU-ESC (`Apache-2.0`) carries the training artifact while
UIT-VSFC is kept as the in-domain benchmark. Both sources can also be combined
for an ablation, but every row always carries its `DatasetSource` so metrics can
be reported per source and no unlicensed source silently enters a distributable
artifact.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import hashlib
from pathlib import Path

from .data import load_official_splits
from .neu_esc import load_all_splits


UIT_VSFC_SOURCE = "uit-vsfc"
NEU_ESC_SOURCE = "neu-esc"
SOURCES = (UIT_VSFC_SOURCE, NEU_ESC_SOURCE)
COMBINED_SPEC = f"{UIT_VSFC_SOURCE}+{NEU_ESC_SOURCE}"
ALL_SPEC = "all"

SPLITS = ("train", "dev", "test")
# Canonical split name -> NEU-ESC file split name.
NEU_ESC_SPLIT_NAMES = {"train": "train", "dev": "val", "test": "test"}


@dataclass(frozen=True)
class CorpusSplit:
    name: str
    texts: list[str]
    labels: list[str]
    sources: list[str]

    def __post_init__(self) -> None:
        if not (len(self.texts) == len(self.labels) == len(self.sources)):
            raise ValueError(f"Corpus split {self.name!r} has inconsistent column lengths")
        invalid = sorted(set(self.sources) - set(SOURCES))
        if invalid:
            raise ValueError(f"Corpus split {self.name!r} has unknown DatasetSource values: {invalid}")

    @property
    def rows(self) -> int:
        return len(self.texts)

    def subset(self, source: str) -> "CorpusSplit":
        indexes = [index for index, value in enumerate(self.sources) if value == source]
        return CorpusSplit(
            name=f"{self.name}:{source}",
            texts=[self.texts[index] for index in indexes],
            labels=[self.labels[index] for index in indexes],
            sources=[self.sources[index] for index in indexes],
        )


@dataclass(frozen=True)
class CorpusBuild:
    spec: str
    sources: tuple[str, ...]
    splits: dict[str, CorpusSplit]
    manifest: dict[str, object]


def parse_source_spec(spec: str) -> tuple[str, ...]:
    normalized = spec.strip().casefold()
    if normalized in (ALL_SPEC, COMBINED_SPEC):
        return SOURCES
    parts = tuple(part for part in normalized.split("+") if part)
    if not parts:
        raise ValueError("Source spec is empty")
    unknown = sorted(set(parts) - set(SOURCES))
    if unknown:
        raise ValueError(f"Unknown dataset source(s) {unknown}; known sources: {list(SOURCES)}")
    ordered = tuple(source for source in SOURCES if source in parts)
    return ordered


def _text_key(text: str) -> str:
    return text.casefold()


def _fingerprint(text: str) -> str:
    """Short hash used in manifests so artifacts never store comment text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _load_sources(spec: tuple[str, ...], uit_root: Path, neu_root: Path) -> dict[str, dict[str, object]]:
    loaded: dict[str, dict[str, object]] = {}
    if UIT_VSFC_SOURCE in spec:
        loaded[UIT_VSFC_SOURCE] = load_official_splits(Path(uit_root))
    if NEU_ESC_SOURCE in spec:
        loaded[NEU_ESC_SOURCE] = load_all_splits(Path(neu_root))
    return loaded


def build_corpus(
    spec: str,
    uit_root: Path,
    neu_root: Path,
    drop_train_duplicates_from_eval: bool = True,
) -> CorpusBuild:
    """Merge the requested sources into `train`/`dev`/`test` splits.

    Rows are deduplicated inside a split, and evaluation rows whose text also
    appears in the training split are dropped by default to prevent leakage
    between an official split and a merged corpus.
    """
    sources = parse_source_spec(spec)
    loaded = _load_sources(sources, uit_root, neu_root)

    # Raw per-source rows first, so leakage checks see the whole training split.
    raw: dict[str, list[tuple[str, str, str]]] = {split: [] for split in SPLITS}
    for source in sources:
        splits = loaded[source]
        for split in SPLITS:
            if source == UIT_VSFC_SOURCE:
                dataset_split = splits[split]  # type: ignore[index]
            else:
                dataset_split = splits[NEU_ESC_SPLIT_NAMES[split]]  # type: ignore[index]
            for text, label in zip(dataset_split.texts, dataset_split.labels):
                raw[split].append((text, label, source))

    train_keys = {_text_key(text) for text, _, _ in raw["train"]}

    manifest: dict[str, object] = {
        "source_spec": spec,
        "sources": list(sources),
        "drop_train_duplicates_from_eval": drop_train_duplicates_from_eval,
        "splits": {},
    }

    corpus_splits: dict[str, CorpusSplit] = {}
    for split in SPLITS:
        seen: set[str] = set()
        texts: list[str] = []
        labels: list[str] = []
        split_sources: list[str] = []
        dropped_duplicates: Counter[str] = Counter()
        dropped_leakage: Counter[str] = Counter()
        dropped_leakage_fingerprints: list[str] = []

        for text, label, source in raw[split]:
            key = _text_key(text)
            if key in seen:
                dropped_duplicates[source] += 1
                continue
            if drop_train_duplicates_from_eval and split != "train" and key in train_keys:
                dropped_leakage[source] += 1
                if len(dropped_leakage_fingerprints) < 20:
                    dropped_leakage_fingerprints.append(_fingerprint(text))
                continue
            seen.add(key)
            texts.append(text)
            labels.append(label)
            split_sources.append(source)

        corpus_split = CorpusSplit(split, texts, labels, split_sources)
        corpus_splits[split] = corpus_split
        manifest["splits"][split] = {
            "rows": corpus_split.rows,
            "rows_by_source": dict(sorted(Counter(corpus_split.sources).items())),
            "label_distribution": dict(sorted(Counter(corpus_split.labels).items())),
            "label_distribution_by_source": {
                source: dict(sorted(Counter(
                    label for label, value in zip(corpus_split.labels, corpus_split.sources) if value == source
                ).items()))
                for source in sorted(set(corpus_split.sources))
            },
            "dropped_duplicate_rows": dict(sorted(dropped_duplicates.items())),
            "dropped_train_overlap_rows": dict(sorted(dropped_leakage.items())),
            "dropped_train_overlap_fingerprints": dropped_leakage_fingerprints,
        }

    return CorpusBuild(spec=spec, sources=sources, splits=corpus_splits, manifest=manifest)
