"""Unit tests for the 5-class inference engine and PhoBERT model utilities."""

from __future__ import annotations

import unittest
import numpy as np
import torch

from sentiment_baseline.inference_engine import (
    SentimentInferenceEngine,
    contains_contrast_marker,
    split_clauses,
)
from sentiment_baseline.phobert_model import compute_class_weights


class TestInferenceEngine(unittest.TestCase):
    def test_split_clauses_contrast(self) -> None:
        text = "Thầy dạy rất nhiệt tình nhưng cơ sở vật chất còn thiếu thốn."
        clauses = split_clauses(text)
        self.assertGreaterEqual(len(clauses), 2)
        self.assertIn("Thầy dạy rất nhiệt tình", clauses[0])
        self.assertIn("cơ sở vật chất còn thiếu thốn", clauses[1])

    def test_split_clauses_semicolon(self) -> None:
        text = "Học phí hợp lý; phòng học hơi chật chội"
        clauses = split_clauses(text)
        self.assertEqual(len(clauses), 2)
        self.assertEqual(clauses[0], "Học phí hợp lý")
        self.assertEqual(clauses[1], "phòng học hơi chật chội")

    def test_split_clauses_single_sentence(self) -> None:
        text = "Môn học rất bổ ích và thiết thực."
        clauses = split_clauses(text)
        self.assertEqual(len(clauses), 1)
        self.assertEqual(clauses[0], "Môn học rất bổ ích và thiết thực")

    def test_split_clauses_empty_and_whitespace(self) -> None:
        self.assertEqual(split_clauses(""), [])
        self.assertEqual(split_clauses("   \n\t  "), [])

    def test_contains_contrast_marker(self) -> None:
        self.assertTrue(contains_contrast_marker("Giảng viên tốt nhưng mic rè"))
        self.assertTrue(contains_contrast_marker("Hài lòng; mong cải thiện thêm"))
        self.assertTrue(contains_contrast_marker("Trường sạch sẽ tuy nhiên nhà xe đông"))
        self.assertFalse(contains_contrast_marker("Thầy cô rất nhiệt tình và chu đáo"))

    def test_predict_pure_sentiment(self) -> None:
        def mock_predict(texts: list[str]) -> np.ndarray:
            probs = []
            for t in texts:
                if "tốt" in t.lower() or "hay" in t.lower():
                    probs.append([0.05, 0.10, 0.85])  # Positive
                elif "kém" in t.lower() or "tệ" in t.lower():
                    probs.append([0.85, 0.10, 0.05])  # Negative
                else:
                    probs.append([0.10, 0.80, 0.10])  # Neutral
            return np.array(probs, dtype=np.float32)

        engine = SentimentInferenceEngine(mock_predict, confidence_threshold=0.60)
        res_pos = engine.predict_one("Bài giảng rất hay và ý nghĩa")
        self.assertEqual(res_pos.predicted_label, "Positive")
        self.assertFalse(res_pos.is_mixed)
        self.assertFalse(res_pos.is_uncertain)

        res_neg = engine.predict_one("Chất lượng dịch vụ quá kém")
        self.assertEqual(res_neg.predicted_label, "Negative")

        res_neu = engine.predict_one("Bình thường không có ý kiến")
        self.assertEqual(res_neu.predicted_label, "Neutral")

    def test_predict_uncertain_fallback(self) -> None:
        def mock_flat_predict(texts: list[str]) -> np.ndarray:
            # Low confidence flat distribution: max is 0.40
            return np.full((len(texts), 3), 1.0 / 3.0, dtype=np.float32)

        engine = SentimentInferenceEngine(mock_flat_predict, confidence_threshold=0.55)
        res = engine.predict_one("Câu này khó đoán nhãn cảm xúc")
        self.assertEqual(res.predicted_label, "Uncertain")
        self.assertTrue(res.is_uncertain)
        self.assertFalse(res.is_mixed)

    def test_predict_mixed_detection(self) -> None:
        def mock_clause_aware_predict(texts: list[str]) -> np.ndarray:
            probs = []
            for t in texts:
                tl = t.lower()
                if "nhiệt tình" in tl and "nóng" in tl:
                    # Overall text: ambiguous/balanced
                    probs.append([0.45, 0.10, 0.45])
                elif "nhiệt tình" in tl:
                    probs.append([0.05, 0.10, 0.85])  # Positive
                elif "nóng" in tl:
                    probs.append([0.85, 0.10, 0.05])  # Negative
                else:
                    probs.append([0.10, 0.80, 0.10])
            return np.array(probs, dtype=np.float32)

        engine = SentimentInferenceEngine(mock_clause_aware_predict, confidence_threshold=0.55)
        res = engine.predict_one("Thầy dạy nhiệt tình nhưng phòng học nóng quá")
        self.assertEqual(res.predicted_label, "Mixed")
        self.assertTrue(res.is_mixed)
        self.assertGreaterEqual(len(res.clauses), 2)


class TestPhobertModelUtils(unittest.TestCase):
    def test_compute_class_weights_balanced(self) -> None:
        labels = ["Negative", "Neutral", "Neutral", "Neutral", "Positive"]
        weights = compute_class_weights(labels, num_classes=3)
        self.assertEqual(len(weights), 3)
        self.assertTrue(isinstance(weights, torch.Tensor))
        # Neutral appears 3 times, Negative 1 time, Positive 1 time
        # Neutral weight should be smaller than Negative/Positive weights
        w_neg, w_neu, w_pos = weights[0].item(), weights[1].item(), weights[2].item()
        self.assertGreater(w_neg, w_neu)
        self.assertGreater(w_pos, w_neu)
        self.assertAlmostEqual(w_neg, w_pos, places=4)


if __name__ == "__main__":
    unittest.main()
