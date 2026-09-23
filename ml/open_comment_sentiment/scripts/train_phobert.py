"""Fine-tune PhoBERT-base-v2 on NEU-ESC educational sentiment dataset."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score
from transformers import EvalPrediction, TrainingArguments

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output
from sentiment_baseline.neu_esc import load_all_splits
from sentiment_baseline.phobert_model import (
    DEFAULT_MAX_LENGTH,
    ID2LABEL,
    LABEL2ID,
    LABEL_NAMES,
    PhobertSentimentDataset,
    WeightedTrainer,
    compute_class_weights,
    load_phobert_model,
    load_phobert_tokenizer,
)


def compute_metrics_fn(eval_pred: EvalPrediction) -> dict[str, float]:
    predictions, labels = eval_pred.predictions, eval_pred.label_ids
    if isinstance(predictions, tuple):
        predictions = predictions[0]

    preds = np.argmax(predictions, axis=-1)
    acc = accuracy_score(labels, preds)
    macro_f1 = f1_score(labels, preds, average="macro", zero_division=0)
    report = classification_report(
        labels,
        preds,
        target_names=list(LABEL_NAMES),
        output_dict=True,
        zero_division=0,
    )

    return {
        "accuracy": float(acc),
        "macro_f1": float(macro_f1),
        "negative_f1": float(report["Negative"]["f1-score"]),
        "negative_recall": float(report["Negative"]["recall"]),
        "negative_precision": float(report["Negative"]["precision"]),
        "neutral_f1": float(report["Neutral"]["f1-score"]),
        "positive_f1": float(report["Positive"]["f1-score"]),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune PhoBERT-base-v2 on NEU-ESC dataset")
    parser.add_argument("--neu-esc-dir", type=Path, default=Path("data/raw/neu_esc"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/phobert_checkpoint"))
    parser.add_argument("--summary-file", type=Path, default=Path("artifacts/phobert-training-summary.json"))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    # Mặc định lấy đúng độ dài lúc chạy thật (DEFAULT_MAX_LENGTH = 256) thay vì 160 như trước.
    # Huấn luyện ở 160 trong khi suy luận cắt ở 256 là lệch giữa lúc dạy và lúc chạy: model chưa
    # từng thấy câu dài hơn 160 token, còn lúc chạy thì được đưa tới 256. Đổi mặc định này làm kết
    # quả huấn luyện khác đi so với các lượt cũ — đó là chủ đích, và `max_length` được ghi vào tóm
    # tắt để lần sau còn biết lượt nào chạy ở mức nào.
    parser.add_argument("--max-length", type=int, default=DEFAULT_MAX_LENGTH)
    # Ghi lại seed để lần huấn luyện tái lập được. Trước đây script không nhận seed nên hai lần
    # chạy cùng tham số vẫn ra hai model khác nhau, và không có gì trong tóm tắt nói điều đó.
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--no-weighted-loss", action="store_true", help="Disable class weighted loss")
    return parser.parse_args()


def main() -> int:
    force_utf8_output()
    args = parse_args()

    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"=== Huấn luyện PhoBERT-base-v2 trên NEU-ESC ===")
    print(f"Thiết bị: {device_name} (CUDA: {torch.cuda.is_available()})")
    print(f"Số epochs: {args.epochs}, Batch size: {args.batch_size}, LR: {args.learning_rate}")

    # 1. Load NEU-ESC dataset
    splits = load_all_splits(args.neu_esc_dir)
    train_split = splits["train"]
    val_split = splits["val"]
    test_split = splits["test"]

    print(f"Số mẫu Train: {len(train_split.texts)}")
    print(f"Số mẫu Val:   {len(val_split.texts)}")
    print(f"Số mẫu Test:  {len(test_split.texts)}")

    # 2. Tokenizer & Datasets
    print("Đang tải tokenizer vinai/phobert-base-v2...")
    tokenizer = load_phobert_tokenizer("vinai/phobert-base-v2")

    train_dataset = PhobertSentimentDataset(
        train_split.texts, train_split.labels, tokenizer, max_length=args.max_length
    )
    val_dataset = PhobertSentimentDataset(
        val_split.texts, val_split.labels, tokenizer, max_length=args.max_length
    )
    test_dataset = PhobertSentimentDataset(
        test_split.texts, test_split.labels, tokenizer, max_length=args.max_length
    )

    # 3. Class weights
    if not args.no_weighted_loss:
        class_weights = compute_class_weights(train_split.labels)
        print("Trọng số phân lớp (Negative, Neutral, Positive):", [round(w.item(), 3) for w in class_weights])
    else:
        class_weights = None
        print("Sử dụng Unweighted Cross-Entropy loss")

    # 4. Model
    print("Đang khởi tạo mô hình PhoBERT...")
    model = load_phobert_model("vinai/phobert-base-v2", num_labels=3)

    # 5. Training Arguments
    args.output_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(args.output_dir / "training_runs"),
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        warmup_ratio=0.1,
        logging_steps=50,
        seed=args.seed,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics_fn,
        class_weights=class_weights,
    )

    # 6. Train
    print("Bắt đầu huấn luyện...")
    train_result = trainer.train()
    print("Huấn luyện hoàn tất!")

    # 7. Evaluate on NEU-ESC Test Set
    print("\n=== Đánh giá trên NEU-ESC Test Set ===")
    test_metrics = trainer.evaluate(test_dataset)

    # Run predictions on test set to extract full classification report
    test_predictions = trainer.predict(test_dataset)
    test_preds = np.argmax(test_predictions.predictions, axis=-1)
    full_report = classification_report(
        test_predictions.label_ids,
        test_preds,
        target_names=list(LABEL_NAMES),
        digits=4,
        zero_division=0,
    )
    print(full_report)

    macro_f1 = float(test_metrics["eval_macro_f1"])
    neg_recall = float(test_metrics["eval_negative_recall"])
    print(f"Kết quả Test Set:")
    print(f"  - Macro F1:        {macro_f1:.4f} (Mục tiêu: >= 0.80)")
    print(f"  - Negative Recall: {neg_recall:.4f} (Mục tiêu: >= 0.80)")

    meets_f1 = macro_f1 >= 0.80
    meets_recall = neg_recall >= 0.80

    if meets_f1 and meets_recall:
        print("[OK] Đạt tất cả mục tiêu chất lượng trên NEU-ESC!")
    else:
        print(f"[CẢNH BÁO] Chưa đạt toàn bộ mục tiêu (F1: {meets_f1}, Recall: {meets_recall})")

    # 8. Save best checkpoint and tokenizer
    print(f"Lưu checkpoint tốt nhất vào {args.output_dir}...")
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(str(args.output_dir))

    # 9. Save summary JSON
    #
    # Ghi ĐỦ tham số ảnh hưởng tới kết quả, không chỉ những tham số đang được truyền tay.
    # `max_length` từng thiếu ở đây và đó là một lỗ hổng thật: runtime cắt chuỗi ở 256 token
    # (DEFAULT_MAX_LENGTH), còn tham số của script này mặc định 160, nên không có cách nào biết
    # lần huấn luyện đã chạy ở mức nào — nếu chạy ở mặc định thì model học trên câu ngắn hơn lúc
    # chạy thật. Từ nay con số đó nằm trong tóm tắt, và cũng ghi cả seed để còn tái lập.
    summary_data = {
        "model_name": "vinai/phobert-base-v2",
        "dataset": "NEU-ESC",
        "train_samples": len(train_split.texts),
        "val_samples": len(val_split.texts),
        "test_samples": len(test_split.texts),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "gradient_accumulation_steps": args.gradient_accumulation_steps,
        "learning_rate": args.learning_rate,
        "max_length": args.max_length,
        "seed": args.seed,
        "weighted_loss": not args.no_weighted_loss,
        "class_weights": [float(w.item()) for w in class_weights] if class_weights is not None else None,
        "test_metrics": {k: float(v) for k, v in test_metrics.items()},
        "targets": {
            "macro_f1_target": 0.80,
            "macro_f1_actual": macro_f1,
            "macro_f1_meets_target": meets_f1,
            "negative_recall_target": 0.80,
            "negative_recall_actual": neg_recall,
            "negative_recall_meets_target": meets_recall,
        },
    }
    args.summary_file.parent.mkdir(parents=True, exist_ok=True)
    with args.summary_file.open("w", encoding="utf-8") as f:
        json.dump(summary_data, f, indent=2, ensure_ascii=False)
    print(f"Đã lưu tóm tắt huấn luyện vào: {args.summary_file}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
