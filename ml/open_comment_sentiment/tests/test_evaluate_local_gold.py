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

from evaluate_local_gold import main  # noqa: E402


class DummyModel:
    def predict(self, texts: list[str]) -> list[str]:
        # Simple rule: if text contains 'khen' -> Positive, 'chê' -> Negative, else Neutral
        results: list[str] = []
        for t in texts:
            if "khen" in t:
                results.append("Positive")
            elif "chê" in t:
                results.append("Negative")
            else:
                results.append("Neutral")
        return results


class EvaluateLocalGoldTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.temp_dir = Path(self._temp.name)
        self.gold_path = self.temp_dir / "gold.csv"
        self.output_path = self.temp_dir / "report.json"

    def tearDown(self) -> None:
        self._temp.cleanup()

    def run_main(self, extra: list[str]) -> int:
        argv = ["evaluate_local_gold.py", "--input", str(self.gold_path), "--output", str(self.output_path), *extra]
        with mock.patch.object(sys, "argv", argv):
            return main()

    def test_evaluates_3class_and_reports_derived_breakdown(self) -> None:
        fields = ["SampleId", "Text", "Sentiment", "Split"]
        rows = [
            {"SampleId": "S1", "Text": "thầy dạy khen hay", "Sentiment": "Positive", "Split": "test"},
            {"SampleId": "S2", "Text": "bài tập chê khó", "Sentiment": "Negative", "Split": "test"},
            {"SampleId": "S3", "Text": "bình thường", "Sentiment": "Neutral", "Split": "test"},
            {"SampleId": "S4", "Text": "dạy khen nhưng bài chê", "Sentiment": "Mixed", "Split": "test"},
            {"SampleId": "S5", "Text": "khác", "Sentiment": "Positive", "Split": "calibration"},
        ]
        with self.gold_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

        dummy_path = self.temp_dir / "dummy.joblib"
        dummy_path.touch()

        with mock.patch("joblib.load", return_value=DummyModel()):
            exit_code = self.run_main(["--models", str(dummy_path), "--split", "test"])

        self.assertEqual(exit_code, 0)
        self.assertTrue(self.output_path.is_file())

        report = json.loads(self.output_path.read_text(encoding="utf-8"))
        self.assertEqual(report["total_rows"], 4)
        self.assertEqual(report["evaluated_3class_rows"], 3)
        self.assertEqual(report["derived_label_rows"], 1)
        self.assertIn("dummy", report["models"])
        self.assertEqual(report["models"]["dummy"]["accuracy"], 1.0)
        self.assertIn("Mixed", report["derived_label_predictions"]["dummy"])

    def test_rejects_unknown_or_empty_label(self) -> None:
        fields = ["SampleId", "Text", "Sentiment", "Split"]
        rows = [{"SampleId": "S1", "Text": "test", "Sentiment": "KhongHopLe", "Split": "test"}]
        with self.gold_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

        with self.assertRaises(ValueError) as ctx:
            self.run_main([])
        self.assertIn("KhongHopLe", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
