from __future__ import annotations

import csv
from pathlib import Path
import sys
import unicodedata
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

FIXTURE = PROJECT_ROOT / "data" / "fixtures" / "regression-comments.csv"
ALLOWED_LABELS = ("Negative", "Neutral", "Positive", "Mixed", "Uncertain")
REQUIRED_COLUMNS = {"CaseId", "Text", "ReferenceSentiment", "EdgeCase", "NeedsAdjudication", "IsSynthetic"}
REQUIRED_EDGE_CASES = {
    "negation",
    "double-negation",
    "sarcasm-with-emoji",
    "empty-opinion",
    "suggestion-neutral",
    "mixed-two-clauses",
    "abbreviation",
    "gibberish",
    "no-diacritics",
}


def read_fixture() -> list[dict[str, str]]:
    with FIXTURE.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


class RegressionFixtureTests(unittest.TestCase):
    """The fixture only detects regressions. It must never replace a real gold set."""

    def setUp(self) -> None:
        self.rows = read_fixture()

    def test_fixture_exists_and_is_not_empty(self) -> None:
        self.assertTrue(FIXTURE.is_file())
        self.assertGreaterEqual(len(self.rows), 30)

    def test_schema_and_labels_are_valid(self) -> None:
        self.assertTrue(REQUIRED_COLUMNS.issubset(self.rows[0]))
        invalid = sorted({row["ReferenceSentiment"] for row in self.rows} - set(ALLOWED_LABELS))
        self.assertEqual(invalid, [], f"Invalid reference labels: {invalid}")

    def test_case_ids_are_unique_and_text_is_present(self) -> None:
        ids = [row["CaseId"] for row in self.rows]
        self.assertEqual(len(ids), len(set(ids)))
        for row in self.rows:
            self.assertTrue(row["Text"].strip(), f"{row['CaseId']} has empty text")

    def test_every_row_is_flagged_synthetic(self) -> None:
        """Guards against someone pasting real survey comments into this file."""
        offenders = [row["CaseId"] for row in self.rows if row["IsSynthetic"].strip().upper() != "Y"]
        self.assertEqual(offenders, [], f"Rows that are not marked synthetic: {offenders}")

    def test_required_edge_cases_are_covered(self) -> None:
        covered = {row["EdgeCase"] for row in self.rows}
        missing = sorted(REQUIRED_EDGE_CASES - covered)
        self.assertEqual(missing, [], f"Missing edge cases: {missing}")

    def test_text_is_nfc_normalized_and_trimmed(self) -> None:
        for row in self.rows:
            text = row["Text"]
            self.assertEqual(text, text.strip(), f"{row['CaseId']} has surrounding whitespace")
            self.assertEqual(
                text, unicodedata.normalize("NFC", text), f"{row['CaseId']} is not NFC normalized"
            )

    def test_boundary_cases_are_flagged_for_adjudication(self) -> None:
        flagged = {row["CaseId"] for row in self.rows if row["NeedsAdjudication"].strip().upper() == "Y"}
        self.assertGreaterEqual(
            len(flagged), 5, "Boundary cases must be marked NeedsAdjudication=Y before any metric use"
        )


if __name__ == "__main__":
    unittest.main()
