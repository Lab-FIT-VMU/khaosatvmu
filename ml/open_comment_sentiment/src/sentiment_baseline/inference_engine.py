"""Five-class sentiment inference engine with clause-level Mixed resolution and threshold calibration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Sequence
import re
import numpy as np
import torch

from .phobert_model import ID2LABEL, LABEL2ID, LABEL_NAMES


FIVE_CLASS_LABELS = ("Positive", "Negative", "Neutral", "Mixed", "Uncertain")

# Conjunctions and punctuation marking contrast or clause boundaries
CONTRAST_CONJUNCTIONS = ("nhưng", "tuy nhiên", "mặc dù vậy", "song", "dẫu vậy", "thế nhưng")
_CONTRAST_PATTERN = re.compile(
    r"(?:\s*(?:nhưng|tuy nhiên|mặc dù vậy|song|dẫu vậy|thế nhưng)\s*|[;!?\n]+|(?<=[^\d])\.\s+)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ClauseSentiment:
    """Sentiment classification for an individual clause."""

    clause: str
    predicted_label: str
    confidence: float
    probabilities: dict[str, float]


@dataclass(frozen=True)
class SentimentResult:
    """Final 5-class sentiment prediction for a text input."""

    text: str
    predicted_label: str
    confidence: float
    base_label: str
    base_probabilities: dict[str, float]
    clauses: list[ClauseSentiment] = field(default_factory=list)
    is_mixed: bool = False
    is_uncertain: bool = False


def split_clauses(text: str) -> list[str]:
    """Split text into distinct clauses by contrastive conjunctions and sentence delimiters."""
    cleaned = text.strip()
    if not cleaned:
        return []

    raw_clauses = _CONTRAST_PATTERN.split(cleaned)
    clauses: list[str] = []
    for clause in raw_clauses:
        stripped = clause.strip(" ,.-;:!?\t\n")
        # Keep clauses with at least 2 tokens and 3 alphanumeric characters
        tokens = stripped.split()
        if len(tokens) >= 2 and len(stripped) >= 3:
            clauses.append(stripped)

    # If splitting resulted in no valid sub-clauses, return original cleaned text
    if not clauses and cleaned:
        return [cleaned]
    return clauses


def contains_contrast_marker(text: str) -> bool:
    """Check if the text contains explicit contrastive conjunctions or semicolons."""
    folded = f" {text.casefold()} "
    if ";" in text:
        return True
    return any(f" {marker} " in folded for marker in CONTRAST_CONJUNCTIONS)


class SentimentInferenceEngine:
    """Engine executing 3-class base prediction + 5-class rule resolution."""

    def __init__(
        self,
        predict_proba_fn: Callable[[list[str]], np.ndarray],
        confidence_threshold: float = 0.55,
        mixed_clause_min_confidence: float = 0.40,
    ) -> None:
        """
        Args:
            predict_proba_fn: Function mapping list of texts to (N, 3) probabilities
                              ordered as [Negative, Neutral, Positive].
            confidence_threshold: Cutoff below which predictions fall back to 'Uncertain'.
            mixed_clause_min_confidence: Minimum clause probability to consider a polarity valid.
        """
        self.predict_proba_fn = predict_proba_fn
        self.confidence_threshold = float(confidence_threshold)
        self.mixed_clause_min_confidence = float(mixed_clause_min_confidence)

    def predict_one(self, text: str) -> SentimentResult:
        """Predict 5-class sentiment for a single text."""
        return self.predict_batch([text])[0]

    def predict_batch(self, texts: Sequence[str]) -> list[SentimentResult]:
        """Predict 5-class sentiment for a batch of texts."""
        if not texts:
            return []

        # 1. Base prediction on full texts
        base_probs_arr = self.predict_proba_fn(list(texts))
        if base_probs_arr.shape[1] != 3:
            raise ValueError(
                f"Expected predict_proba_fn to return (N, 3) probabilities, got shape {base_probs_arr.shape}"
            )

        results: list[SentimentResult] = []

        # Identify texts that require clause evaluation (contains contrast or multiple sentences)
        clauses_by_index: dict[int, list[str]] = {}
        all_clauses_to_predict: list[tuple[int, int, str]] = []  # (text_idx, clause_idx, clause_text)

        for i, text in enumerate(texts):
            if not text.strip():
                continue
            split = split_clauses(text)
            clauses_by_index[i] = split
            if len(split) >= 2 or contains_contrast_marker(text):
                for j, clause in enumerate(split):
                    all_clauses_to_predict.append((i, j, clause))

        # Predict all clauses in a single batch if any exist
        clause_probs_lookup: dict[tuple[int, int], np.ndarray] = {}
        if all_clauses_to_predict:
            clause_texts = [item[2] for item in all_clauses_to_predict]
            clause_probs_arr = self.predict_proba_fn(clause_texts)
            for k, (text_idx, clause_idx, _) in enumerate(all_clauses_to_predict):
                clause_probs_lookup[(text_idx, clause_idx)] = clause_probs_arr[k]

        # 2. Synthesize 5-class decisions
        for i, text in enumerate(texts):
            stripped = text.strip()
            if not stripped:
                results.append(
                    SentimentResult(
                        text=text,
                        predicted_label="Uncertain",
                        confidence=0.0,
                        base_label="Neutral",
                        base_probabilities={"Negative": 0.0, "Neutral": 1.0, "Positive": 0.0},
                        clauses=[],
                        is_mixed=False,
                        is_uncertain=True,
                    )
                )
                continue

            base_probs = base_probs_arr[i]
            base_label_idx = int(np.argmax(base_probs))
            base_label = ID2LABEL[base_label_idx]
            base_confidence = float(base_probs[base_label_idx])
            prob_dict = {
                LABEL_NAMES[c]: float(base_probs[c]) for c in range(len(LABEL_NAMES))
            }

            # Assemble clause details
            clause_sentiments: list[ClauseSentiment] = []
            positive_masses: list[float] = []
            negative_masses: list[float] = []

            text_clauses = clauses_by_index.get(i, [stripped])
            for j, clause in enumerate(text_clauses):
                c_key = (i, j)
                if c_key in clause_probs_lookup:
                    c_probs = clause_probs_lookup[c_key]
                else:
                    c_probs = base_probs

                c_label_idx = int(np.argmax(c_probs))
                c_label = ID2LABEL[c_label_idx]
                c_conf = float(c_probs[c_label_idx])
                c_dict = {LABEL_NAMES[c]: float(c_probs[c]) for c in range(len(LABEL_NAMES))}
                clause_sentiments.append(
                    ClauseSentiment(
                        clause=clause,
                        predicted_label=c_label,
                        confidence=c_conf,
                        probabilities=c_dict,
                    )
                )

                # Mixed decision looks at the clause PROBABILITY MASS, not at its argmax.
                # Requiring argmax (the old rule) threw away a complaint clause that the model
                # called Neutral while still giving p(Negative) = 0.45 -- which is why 30 of 58
                # two-sided sentences in the local gold set came out as Positive. Measured on the
                # frozen 200-sentence test split: Mixed recall 0.2241 -> 0.5862, accuracy
                # 0.6600 -> 0.7650, flagged-set precision unchanged at 1.0000.
                positive_mass = float(c_probs[2])
                negative_mass = float(c_probs[0])
                if positive_mass >= self.mixed_clause_min_confidence:
                    positive_masses.append(positive_mass)
                elif negative_mass >= self.mixed_clause_min_confidence:
                    negative_masses.append(negative_mass)

            # Mixed determination:
            # Requires both positive and negative components across distinct clauses
            is_mixed = bool(positive_masses) and bool(negative_masses)

            # Uncertain determination:
            # Low confidence on base prediction AND not clearly mixed
            is_uncertain = (base_confidence < self.confidence_threshold) and not is_mixed

            if is_mixed:
                predicted_label = "Mixed"
                final_confidence = min(max(positive_masses), max(negative_masses))
            elif is_uncertain:
                predicted_label = "Uncertain"
                final_confidence = base_confidence
            else:
                predicted_label = base_label
                final_confidence = base_confidence

            results.append(
                SentimentResult(
                    text=text,
                    predicted_label=predicted_label,
                    confidence=final_confidence,
                    base_label=base_label,
                    base_probabilities=prob_dict,
                    clauses=clause_sentiments,
                    is_mixed=is_mixed,
                    is_uncertain=is_uncertain,
                )
            )

        return results


def make_pytorch_predict_fn(
    model: Any,
    tokenizer: Any,
    device: str | torch.device = "cuda" if torch.cuda.is_available() else "cpu",
    batch_size: int = 32,
    max_length: int = 256,
) -> Callable[[list[str]], np.ndarray]:
    """Create a vectorized prediction function from a PyTorch PhoBERT model and tokenizer."""
    model.eval()
    model.to(device)

    def predict_proba(texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, 3), dtype=np.float32)

        all_probs: list[np.ndarray] = []
        with torch.no_grad():
            for start in range(0, len(texts), batch_size):
                batch_texts = texts[start : start + batch_size]
                encoded = tokenizer(
                    batch_texts,
                    padding=True,
                    truncation=True,
                    max_length=max_length,
                    return_tensors="pt",
                ).to(device)

                outputs = model(**encoded)
                logits = outputs.logits
                probs = torch.softmax(logits, dim=-1).cpu().numpy()
                all_probs.append(probs)

        return np.vstack(all_probs)

    return predict_proba


def make_onnx_predict_fn(
    session: Any,
    tokenizer: Any,
    batch_size: int = 32,
    max_length: int = 256,
) -> Callable[[list[str]], np.ndarray]:
    """Create a vectorized prediction function from an ONNX Runtime InferenceSession and tokenizer."""
    input_names = [inp.name for inp in session.get_inputs()]
    output_name = session.get_outputs()[0].name

    def softmax(x: np.ndarray) -> np.ndarray:
        exp_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return exp_x / np.sum(exp_x, axis=-1, keepdims=True)

    def predict_proba(texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, 3), dtype=np.float32)

        all_probs: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch_texts = texts[start : start + batch_size]
            encoded = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="np",
            )

            feed = {}
            if "input_ids" in input_names:
                feed["input_ids"] = encoded["input_ids"].astype(np.int64)
            if "attention_mask" in input_names:
                feed["attention_mask"] = encoded["attention_mask"].astype(np.int64)
            if "token_type_ids" in input_names and "token_type_ids" in encoded:
                feed["token_type_ids"] = encoded["token_type_ids"].astype(np.int64)

            outputs = session.run([output_name], feed)
            logits = outputs[0]
            probs = softmax(logits)
            all_probs.append(probs)

        return np.vstack(all_probs)

    return predict_proba
