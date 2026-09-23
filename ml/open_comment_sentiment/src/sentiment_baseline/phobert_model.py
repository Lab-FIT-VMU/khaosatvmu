"""PhoBERT model utilities and PyTorch dataset for sentiment classification."""

from __future__ import annotations

from typing import Any, Mapping, Sequence
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, Trainer


LABEL_NAMES = ("Negative", "Neutral", "Positive")
LABEL2ID: dict[str, int] = {"Negative": 0, "Neutral": 1, "Positive": 2}
ID2LABEL: dict[int, str] = {0: "Negative", 1: "Neutral", 2: "Positive"}
DEFAULT_MODEL_NAME = "vinai/phobert-base-v2"
DEFAULT_MAX_LENGTH = 256


def compute_class_weights(
    labels: Sequence[str | int],
    num_classes: int = 3,
    label2id: Mapping[str, int] = LABEL2ID,
) -> torch.Tensor:
    """Compute balanced class weights for Cross-Entropy loss: W_c = N / (K * N_c)."""
    numeric_labels: list[int] = []
    for item in labels:
        if isinstance(item, str):
            if item not in label2id:
                raise ValueError(f"Unknown label {item!r} not found in label2id mapping")
            numeric_labels.append(label2id[item])
        else:
            numeric_labels.append(int(item))

    if not numeric_labels:
        raise ValueError("Cannot compute class weights from an empty label collection")

    counts = np.bincount(numeric_labels, minlength=num_classes)
    total_samples = len(numeric_labels)
    weights = np.zeros(num_classes, dtype=np.float32)

    for c in range(num_classes):
        if counts[c] == 0:
            weights[c] = 1.0
        else:
            weights[c] = total_samples / (num_classes * counts[c])

    # Normalize weights so that mean is 1.0
    weights = weights / np.mean(weights)
    return torch.tensor(weights, dtype=torch.float32)


class PhobertSentimentDataset(Dataset):
    """PyTorch Dataset for text classification with PhoBERT tokenizer."""

    def __init__(
        self,
        texts: Sequence[str],
        labels: Sequence[str | int] | None = None,
        tokenizer: Any = None,
        max_length: int = DEFAULT_MAX_LENGTH,
        label2id: Mapping[str, int] = LABEL2ID,
    ) -> None:
        self.texts = list(texts)
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.label2id = label2id

        if labels is not None:
            if len(texts) != len(labels):
                raise ValueError(
                    f"Mismatch between number of texts ({len(texts)}) and labels ({len(labels)})"
                )
            self.labels: list[int] | None = [
                self.label2id[lbl] if isinstance(lbl, str) else int(lbl) for lbl in labels
            ]
        else:
            self.labels = None

    def __len__(self) -> int:
        return len(self.texts)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        text = self.texts[idx]
        if self.tokenizer is None:
            raise RuntimeError("Tokenizer is not set on PhobertSentimentDataset")

        encoding = self.tokenizer(
            text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        item = {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
        }

        if self.labels is not None:
            item["labels"] = torch.tensor(self.labels[idx], dtype=torch.long)

        return item


class WeightedTrainer(Trainer):
    """Hugging Face Trainer subclass supporting weighted cross-entropy loss."""

    def __init__(self, *args: Any, class_weights: torch.Tensor | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(
        self,
        model: Any,
        inputs: dict[str, Any],
        return_outputs: bool = False,
        **kwargs: Any,
    ) -> Any:
        labels = inputs.get("labels")
        outputs = model(**inputs)

        if labels is None:
            loss = outputs.loss
        elif self.class_weights is not None:
            logits = outputs.logits
            weight = self.class_weights.to(logits.device)
            loss_fct = torch.nn.CrossEntropyLoss(weight=weight)
            loss = loss_fct(logits.view(-1, self.model.config.num_labels), labels.view(-1))
        else:
            loss = outputs.loss

        return (loss, outputs) if return_outputs else loss


def load_phobert_tokenizer(model_name_or_path: str = DEFAULT_MODEL_NAME) -> Any:
    """Load PhoBERT tokenizer."""
    return AutoTokenizer.from_pretrained(model_name_or_path, use_fast=False)


def load_phobert_model(
    model_name_or_path: str = DEFAULT_MODEL_NAME,
    num_labels: int = len(LABEL_NAMES),
    id2label: Mapping[int, str] | None = None,
    label2id: Mapping[str, int] | None = None,
) -> Any:
    """Load AutoModelForSequenceClassification with specified number of labels."""
    resolved_id2label = dict(id2label) if id2label is not None else ID2LABEL
    resolved_label2id = dict(label2id) if label2id is not None else LABEL2ID

    return AutoModelForSequenceClassification.from_pretrained(
        model_name_or_path,
        num_labels=num_labels,
        id2label=resolved_id2label,
        label2id=resolved_label2id,
    )
