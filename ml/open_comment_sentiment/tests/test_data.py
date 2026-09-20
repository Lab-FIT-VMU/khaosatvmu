from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.data import load_official_splits, normalize_text  # noqa: E402


class DataLoaderTests(unittest.TestCase):
    def test_normalize_text_preserves_vietnamese_diacritics(self) -> None:
        self.assertEqual(normalize_text("  Giảng   viên tốt!  "), "Giảng viên tốt!")

    def test_loads_and_maps_all_official_splits(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for split in ("train", "dev", "test"):
                split_dir = root / split
                split_dir.mkdir()
                (split_dir / "sents.txt").write_text("Không tốt\nBình thường\nRất tốt\n", encoding="utf-8")
                (split_dir / "sentiments.txt").write_text("0\n1\n2\n", encoding="utf-8")
                (split_dir / "topics.txt").write_text("0\n1\n2\n", encoding="utf-8")

            splits = load_official_splits(root)

        self.assertEqual(splits["train"].labels, ["Negative", "Neutral", "Positive"])
        self.assertEqual(splits["dev"].texts[2], "Rất tốt")


if __name__ == "__main__":
    unittest.main()
