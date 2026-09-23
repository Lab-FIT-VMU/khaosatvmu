from __future__ import annotations

from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from prepare_local_sample import diverse_sample, is_truthy, mask_direct_identifiers  # noqa: E402


class PrepareLocalSampleTests(unittest.TestCase):
    def test_masks_direct_identifiers(self) -> None:
        text = "Liên hệ sv@example.edu.vn, https://example.edu hoặc 0912 345 678"
        masked = mask_direct_identifiers(text)
        self.assertEqual(masked, "Liên hệ [EMAIL], [URL] hoặc [PHONE]")

    def test_is_truthy_accepts_postgres_and_csv_spellings(self) -> None:
        for value in ("t", "T", "true", "TRUE", "1", "yes", "y"):
            self.assertTrue(is_truthy(value), value)
        for value in ("f", "false", "0", "no", "", "  "):
            self.assertFalse(is_truthy(value), value)

    def test_diverse_sample_is_deterministic_and_capped(self) -> None:
        rows = [
            {"Text": "Tốt", "SourceGroup": "A"},
            {"Text": "Giảng viên dạy rất dễ hiểu", "SourceGroup": "A"},
            {"Text": "Nội dung môn học cần thêm nhiều ví dụ thực hành cụ thể hơn", "SourceGroup": "B"},
            {"Text": "Bình thường", "SourceGroup": "B"},
        ]
        first = diverse_sample(rows, sample_size=3, seed=42)
        second = diverse_sample(rows, sample_size=3, seed=42)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 3)
        self.assertEqual({row["SourceGroup"] for row in first}, {"A", "B"})


if __name__ == "__main__":
    unittest.main()
