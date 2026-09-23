from __future__ import annotations

import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from build_local_gold import canonical_label, main  # noqa: E402

SHEET_FIELDS = ["SampleId", "Text", "SourceGroup", "LengthBucket", "Sentiment", "NeedsAdjudication", "AnnotatorNotes"]
ADJUDICATION_FIELDS = [
    "SampleId",
    "Text",
    "AnnotatorA",
    "AnnotatorB",
    "Sentiment",
    "NeedsAdjudication",
    "AdjudicatorNotes",
]


def write_sheet(path: Path, labels: dict[str, str], texts: dict[str, str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=SHEET_FIELDS)
        writer.writeheader()
        for sample_id, text in texts.items():
            writer.writerow(
                {
                    "SampleId": sample_id,
                    "Text": text,
                    "SourceGroup": "2026-09",
                    "LengthBucket": "medium",
                    "Sentiment": labels.get(sample_id, ""),
                    "NeedsAdjudication": "",
                    "AnnotatorNotes": "",
                }
            )


def write_adjudication(path: Path, resolutions: dict[str, str], texts: dict[str, str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=ADJUDICATION_FIELDS)
        writer.writeheader()
        for sample_id, text in texts.items():
            writer.writerow(
                {
                    "SampleId": sample_id,
                    "Text": text,
                    "AnnotatorA": "",
                    "AnnotatorB": "",
                    "Sentiment": resolutions.get(sample_id, ""),
                    "NeedsAdjudication": "Y",
                    "AdjudicatorNotes": "",
                }
            )


TEXTS = {f"LOCAL-{index:04d}": f"ý kiến số {index}" for index in range(1, 7)}
LABELS_A = {
    "LOCAL-0001": "Positive",
    "LOCAL-0002": "Negative",
    "LOCAL-0003": "Neutral",
    "LOCAL-0004": "Mixed",
    "LOCAL-0005": "Positive",
    "LOCAL-0006": "Uncertain",
}
LABELS_B = {**LABELS_A, "LOCAL-0003": "Uncertain", "LOCAL-0006": "Negative"}


class CanonicalLabelTests(unittest.TestCase):
    def test_accepts_exact_codes_and_case_variants(self) -> None:
        self.assertEqual(canonical_label("Positive"), "Positive")
        self.assertEqual(canonical_label("  positive "), "Positive")

    def test_accepts_vietnamese_aliases_with_and_without_diacritics(self) -> None:
        self.assertEqual(canonical_label("Tích cực"), "Positive")
        self.assertEqual(canonical_label("tieu cuc"), "Negative")
        self.assertEqual(canonical_label("Chưa chắc chắn"), "Uncertain")

    def test_rejects_unknown_and_blank_values(self) -> None:
        self.assertIsNone(canonical_label(""))
        self.assertIsNone(canonical_label("   "))
        self.assertIsNone(canonical_label("chac la tich cuc"))


class BuildLocalGoldTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.review_dir = Path(self._temp.name) / "review"
        self.review_dir.mkdir(parents=True)
        self.output = Path(self._temp.name) / "local-gold.csv"
        with (self.review_dir / "split-assignment.csv").open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["SampleId", "Split", "LengthBucket"])
            writer.writeheader()
            for index, sample_id in enumerate(sorted(TEXTS)):
                writer.writerow({"SampleId": sample_id, "Split": "test" if index % 2 else "calibration", "LengthBucket": "medium"})

    def tearDown(self) -> None:
        self._temp.cleanup()

    def run_main(self, extra: list[str]) -> int:
        argv = ["build_local_gold.py", "--review-dir", str(self.review_dir), "--output", str(self.output), *extra]
        with mock.patch.object(sys, "argv", argv):
            return main()

    def test_reports_progress_and_stops_when_incomplete(self) -> None:
        write_sheet(self.review_dir / "annotator-a.csv", {}, TEXTS)
        write_sheet(self.review_dir / "annotator-b.csv", {}, TEXTS)
        self.assertEqual(self.run_main([]), 3)

    def test_measures_agreement_and_lists_only_disagreements(self) -> None:
        write_sheet(self.review_dir / "annotator-a.csv", LABELS_A, TEXTS)
        write_sheet(self.review_dir / "annotator-b.csv", LABELS_B, TEXTS)
        self.assertEqual(self.run_main([]), 0)

        summary = json.loads((self.review_dir / "agreement-summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["compared_rows"], 6)
        self.assertAlmostEqual(summary["raw_agreement"], 4 / 6)
        self.assertEqual(summary["disagreement_rows"], 2)
        self.assertLessEqual(summary["cohen_kappa"], 1.0)

        with (self.review_dir / "adjudication.csv").open(encoding="utf-8-sig", newline="") as stream:
            adjudication = list(csv.DictReader(stream))
        self.assertEqual({row["SampleId"] for row in adjudication}, {"LOCAL-0003", "LOCAL-0006"})
        self.assertTrue(all(row["Sentiment"] == "" for row in adjudication))

    def test_finalizes_gold_only_after_adjudication_is_complete(self) -> None:
        write_sheet(self.review_dir / "annotator-a.csv", LABELS_A, TEXTS)
        write_sheet(self.review_dir / "annotator-b.csv", LABELS_B, TEXTS)
        adjudication_path = self.review_dir / "adjudication.csv"
        self.assertEqual(self.run_main(["--reset-adjudication"]), 0)

        write_adjudication(adjudication_path, {"LOCAL-0003": "Neutral"}, TEXTS)
        self.assertEqual(self.run_main(["--adjudication", str(adjudication_path)]), 3)

        write_adjudication(adjudication_path, {"LOCAL-0003": "Neutral", "LOCAL-0006": "Uncertain"}, TEXTS)
        self.assertEqual(self.run_main(["--adjudication", str(adjudication_path)]), 0)

        with self.output.open(encoding="utf-8-sig", newline="") as stream:
            gold = list(csv.DictReader(stream))
        self.assertEqual(len(gold), 6)
        sources = {row["SampleId"]: row["LabelSource"] for row in gold}
        self.assertEqual(sources["LOCAL-0001"], "agreement")
        self.assertEqual(sources["LOCAL-0003"], "adjudication")
        self.assertEqual({row["Split"] for row in gold}, {"calibration", "test"})
        self.assertEqual([row["Sentiment"] for row in gold], ["Positive", "Negative", "Neutral", "Mixed", "Positive", "Uncertain"])

    def test_does_not_overwrite_an_existing_adjudication_file(self) -> None:
        write_sheet(self.review_dir / "annotator-a.csv", LABELS_A, TEXTS)
        write_sheet(self.review_dir / "annotator-b.csv", LABELS_B, TEXTS)
        adjudication_path = self.review_dir / "adjudication.csv"
        write_adjudication(adjudication_path, {"LOCAL-0003": "Neutral", "LOCAL-0006": "Negative"}, TEXTS)
        self.assertEqual(self.run_main([]), 0)
        with adjudication_path.open(encoding="utf-8-sig", newline="") as stream:
            rows = {row["SampleId"]: row["Sentiment"] for row in csv.DictReader(stream)}
        self.assertEqual(rows["LOCAL-0003"], "Neutral")
        self.assertEqual(rows["LOCAL-0006"], "Negative")

    def test_rejects_invalid_label_in_a_sheet(self) -> None:
        write_sheet(self.review_dir / "annotator-a.csv", {**LABELS_A, "LOCAL-0001": "khong-ro"}, TEXTS)
        write_sheet(self.review_dir / "annotator-b.csv", LABELS_B, TEXTS)
        self.assertEqual(self.run_main([]), 1)


if __name__ == "__main__":
    unittest.main()
