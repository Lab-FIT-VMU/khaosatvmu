from __future__ import annotations

import csv
from pathlib import Path
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.corpus import (  # noqa: E402
    COMBINED_SPEC,
    NEU_ESC_SOURCE,
    UIT_VSFC_SOURCE,
    build_corpus,
    parse_source_spec,
)
from sentiment_baseline.data import DatasetUnavailableError  # noqa: E402
from sentiment_baseline.neu_esc import (  # noqa: E402
    load_all_splits,
    load_split,
    resolve_sentiment,
)

NEU_HEADER = ["Text", "Sentiment", "Classification"]


def write_csv(path: Path, rows: list[list[str]], header: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(header or NEU_HEADER)
        writer.writerows(rows)


def write_neu_esc_tree(root: Path, extra_val_row: list[str] | None = None) -> None:
    write_csv(
        root / "train_set.csv",
        [
            ["Giảng viên dạy rất dễ hiểu", "1", "Academic"],
            ["Bài tập quá nhiều và không được giải đáp", "2", "Academic"],
            ["Nên bổ sung tài liệu trước buổi học", "0", "Academic"],
            ["Đồ ngu, dạy như không dạy", "3", "Spam"],
        ],
    )
    val_rows = [["Môn học bình thường", "0", "Academic"]]
    if extra_val_row:
        val_rows.append(extra_val_row)
    write_csv(root / "val_set.csv", val_rows)
    write_csv(root / "test_set.csv", [["Thầy hỗ trợ nhiệt tình, bài giảng rõ ràng", "1", "Academic"]])


def write_uit_tree(root: Path) -> None:
    for split, rows in {
        "train": [("Giảng viên nhiệt tình và dễ hiểu", "2"), ("Nội dung quá nhanh", "0")],
        "dev": [("Tài liệu bình thường", "1")],
        "test": [("Môn học ổn", "1")],
    }.items():
        directory = root / split
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "sents.txt").write_text(
            "".join(f"{text}\n" for text, _ in rows), encoding="utf-8"
        )
        (directory / "sentiments.txt").write_text(
            "".join(f"{label}\n" for _, label in rows), encoding="utf-8"
        )
        (directory / "topics.txt").write_text(
            "".join("0\n" for _ in rows), encoding="utf-8"
        )


class ResolveSentimentTests(unittest.TestCase):
    def test_maps_numeric_codes_to_three_classes(self) -> None:
        self.assertEqual(resolve_sentiment("0"), ("Neutral", None))
        self.assertEqual(resolve_sentiment("1"), ("Positive", None))
        self.assertEqual(resolve_sentiment("2"), ("Negative", None))

    def test_drops_toxic_instead_of_mapping_it_to_negative(self) -> None:
        self.assertEqual(resolve_sentiment("3"), (None, "Toxic"))
        self.assertEqual(resolve_sentiment("Toxic"), (None, "Toxic"))

    def test_accepts_pandas_float_codes_and_label_names(self) -> None:
        self.assertEqual(resolve_sentiment("2.0"), ("Negative", None))
        self.assertEqual(resolve_sentiment("positive"), ("Positive", None))

    def test_unknown_value_raises(self) -> None:
        with self.assertRaises(ValueError):
            resolve_sentiment("khong-ro-nhan")


class LoadSplitTests(unittest.TestCase):
    def test_excludes_toxic_rows_and_counts_them(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "train_set.csv"
            write_csv(
                path,
                [
                    ["Rất tốt", "1", "Academic"],
                    ["Nội dung lộn xộn", "2", "Academic"],
                    ["Đồ ngu", "3", "Spam"],
                ],
            )
            split = load_split(path, "train")

        self.assertEqual(split.labels, ["Positive", "Negative"])
        self.assertEqual(split.excluded_label_counts, {"Toxic": 1})
        self.assertEqual(split.excluded_rows, 1)
        self.assertEqual(split.rows_read, 3)
        self.assertEqual(split.rows_kept, 2)
        self.assertNotIn("Đồ ngu", split.texts)

    def test_skips_blank_text_and_ignores_empty_trailing_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "train_set.csv"
            path.write_text(
                "Text,Sentiment,Classification\n"
                "Rất tốt,1,Academic\n"
                "   ,2,Academic\n"
                ",,\n"
                "Bình thường,0,Academic\n",
                encoding="utf-8",
            )
            split = load_split(path, "train")

        self.assertEqual(split.rows_kept, 2)
        self.assertEqual(split.skipped_empty_text, 1)
        self.assertEqual(split.labels, ["Positive", "Neutral"])

    def test_handles_bom_and_alternate_column_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "train_set.csv"
            path.write_text("\ufeffSentence,Label,Topic\nHay lắm,1,Academic\n", encoding="utf-8")
            split = load_split(path, "train")

        self.assertEqual(split.texts, ["Hay lắm"])
        self.assertEqual(split.columns["text"], "Sentence")

    def test_missing_column_raises_with_detected_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "train_set.csv"
            write_csv(path, [["Hay lắm", "1"]], header=["Text", "Sentiment"])
            with self.assertRaises(ValueError) as context:
                load_split(path, "train")
        self.assertIn("topic", str(context.exception))

    def test_all_splits_require_every_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_neu_esc_tree(root)
            splits = load_all_splits(root)
            self.assertEqual(sorted(splits), ["test", "train", "val"])

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_csv(root / "train_set.csv", [["Hay lắm", "1", "Academic"]])
            with self.assertRaises(DatasetUnavailableError) as context:
                load_all_splits(root)
            self.assertIn("gated", str(context.exception).lower())


class CorpusTests(unittest.TestCase):
    def test_parse_source_spec_supports_all_and_combined(self) -> None:
        self.assertEqual(parse_source_spec("all"), (UIT_VSFC_SOURCE, NEU_ESC_SOURCE))
        self.assertEqual(parse_source_spec("neu-esc"), (NEU_ESC_SOURCE,))
        self.assertEqual(parse_source_spec(COMBINED_SPEC), (UIT_VSFC_SOURCE, NEU_ESC_SOURCE))
        with self.assertRaises(ValueError):
            parse_source_spec("uit-vsfc+unknown")

    def test_combined_corpus_keeps_dataset_source_per_row(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_uit_tree(root / "uit")
            write_neu_esc_tree(root / "neu")
            corpus = build_corpus(
                COMBINED_SPEC, uit_root=root / "uit", neu_root=root / "neu"
            )

        train = corpus.splits["train"]
        self.assertEqual(train.rows, 5)
        self.assertIn(UIT_VSFC_SOURCE, train.sources)
        self.assertIn(NEU_ESC_SOURCE, train.sources)
        self.assertEqual(
            corpus.manifest["splits"]["train"]["rows_by_source"],
            {NEU_ESC_SOURCE: 3, UIT_VSFC_SOURCE: 2},
        )
        self.assertEqual(train.subset(UIT_VSFC_SOURCE).rows, 2)
        self.assertEqual(train.subset(NEU_ESC_SOURCE).rows, 3)

    def test_toxic_rows_never_reach_the_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_neu_esc_tree(root)
            corpus = build_corpus("neu-esc", uit_root=root, neu_root=root)

        self.assertNotIn("Đồ ngu, dạy như không dạy", corpus.splits["train"].texts)
        self.assertEqual(
            corpus.manifest["splits"]["train"]["label_distribution"],
            {"Negative": 1, "Neutral": 1, "Positive": 1},
        )

    def test_eval_rows_overlapping_train_are_dropped(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_neu_esc_tree(root, extra_val_row=["Giảng viên dạy rất dễ hiểu", "1", "Academic"])
            corpus = build_corpus("neu-esc", uit_root=root, neu_root=root)

        self.assertEqual(
            corpus.manifest["splits"]["dev"]["dropped_train_overlap_rows"],
            {NEU_ESC_SOURCE: 1},
        )
        self.assertNotIn("Giảng viên dạy rất dễ hiểu", corpus.splits["dev"].texts)

    def test_overlap_kept_when_requested(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_neu_esc_tree(root, extra_val_row=["Giảng viên dạy rất dễ hiểu", "1", "Academic"])
            corpus = build_corpus(
                "neu-esc",
                uit_root=root,
                neu_root=root,
                drop_train_duplicates_from_eval=False,
            )

        self.assertEqual(corpus.splits["dev"].rows, 2)

    def test_manifest_records_duplicate_and_leakage_counts_without_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_neu_esc_tree(root)
            corpus = build_corpus("neu-esc", uit_root=root, neu_root=root)

        manifest = corpus.manifest["splits"]["train"]
        self.assertEqual(manifest["dropped_duplicate_rows"], {})
        self.assertEqual(manifest["dropped_train_overlap_fingerprints"], [])
        self.assertNotIn("Giảng viên", str(corpus.manifest))


if __name__ == "__main__":
    unittest.main()
