#!/usr/bin/env python3
"""Fine-tune tiếp checkpoint PhoBERT trên 200 câu calibration của VMU.

Vì sao có thí nghiệm này: mục 5.5 của kế hoạch còn treo đúng một việc — nâng recall `Negative`
(0,5385 trên tập test đóng băng). Mục 5.8 đã chứng minh không thể giải quyết bằng quy tắc hay
ngưỡng: 312 cấu hình cho chênh lệch đúng bằng 0. Đường còn lại là dữ liệu và huấn luyện, và thứ dữ
liệu duy nhất đang có là **200 câu calibration đã được người chấm**.

Kỷ luật của script:

- Huấn luyện CHỈ trên tập `calibration`. Tập `test` đóng băng không được dùng để chọn epoch, chọn
  ngưỡng hay sửa bất cứ thứ gì, nên script chạy đúng số epoch đã chốt rồi báo cáo kết quả khô —
  không chọn mô hình theo tập test.
- Trước khi tin số mới, script **tái hiện số cũ**: chạy checkpoint gốc trên tập test bằng đúng quy
  tắc đang chạy trong sản phẩm (conf 0,45 / mixed 0,20) rồi so với con số đã ghi trong kế hoạch.
  Lệch nhiều thì kết quả thí nghiệm cũng không đáng tin, và script nói thẳng ra thay vì im lặng.
- Model học 3 lớp gốc, nên câu `Mixed` bị loại khỏi tập huấn luyện (không có nhãn gốc tương ứng).
  `Uncertain` không xuất hiện trong tập gold nên không ảnh hưởng.

Cách chạy:

    .\\.venv\\Scripts\\python.exe scripts/finetune_local_calibration.py
    .\\.venv\\Scripts\\python.exe scripts/finetune_local_calibration.py --epochs 5 --learning-rate 5e-6
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402
from sentiment_baseline.inference_engine import (  # noqa: E402
    SentimentInferenceEngine,
    make_pytorch_predict_fn,
)
from sentiment_baseline.phobert_model import (  # noqa: E402
    LABEL2ID,
    compute_class_weights,
    load_phobert_model,
    load_phobert_tokenizer,
)

# Quy tắc đang chạy trong sản phẩm (OpenCommentSentimentOptions mặc định sau lượt hiệu chỉnh 20/09/2026).
CONFIDENCE_THRESHOLD = 0.45
MIXED_CLAUSE_MIN_CONFIDENCE = 0.20

# Số đã ghi trong kế hoạch ở mục 5.8 cho tập test đóng băng, dùng để tự kiểm trước khi tin số mới.
RECORDED_BASELINE = {
    "accuracy": 0.7650,
    "negative_recall": 0.5385,
    "mixed_recall": 0.5862,
}

# Nhãn dùng để tính metric: đủ 5 nhãn, kể cả nhãn không có trong tập gold. Cố ý KHÔNG để sklearn tự
# chọn nhãn có mặt — đúng cái bẫy đã làm con số macro F1 của tập test bị ghi sai thành 0,6309.
ALL_LABELS = ["Negative", "Neutral", "Positive", "Mixed", "Uncertain"]


def read_gold(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def evaluate(
    engine: SentimentInferenceEngine,
    texts: list[str],
    gold_labels: list[str],
    flagged_confidence: float = CONFIDENCE_THRESHOLD,
) -> tuple[dict, list[str]]:
    """Chạy engine 5 nhãn trên tập test rồi tính metric. Trả về (metric, nhãn dự đoán)."""
    results = engine.predict_batch(texts)
    predicted = [result.predicted_label for result in results]

    per_class = classification_report(
        gold_labels,
        predicted,
        labels=ALL_LABELS,
        output_dict=True,
        zero_division=0,
    )

    # Nhóm bị gắn cờ = dự đoán Negative hoặc Mixed với độ tin cậy đủ cao. Đây là nhóm mà sản phẩm
    # thật sự dùng để cảnh báo, nên precision của nó là chỉ số ra quyết định (xem mục 5.2).
    flagged = [
        (gold, guess)
        for gold, guess, result in zip(gold_labels, predicted, results)
        if guess in {"Negative", "Mixed"} and result.confidence >= flagged_confidence
    ]
    flagged_correct = sum(1 for gold, guess in flagged if gold == guess)

    metrics = {
        "accuracy": float(accuracy_score(gold_labels, predicted)),
        "macro_f1_five_labels": float(f1_score(gold_labels, predicted, labels=ALL_LABELS, average="macro", zero_division=0)),
        "macro_f1_present_labels": float(
            f1_score(
                gold_labels,
                predicted,
                labels=sorted(set(gold_labels) | set(predicted)),
                average="macro",
                zero_division=0,
            )
        ),
        "per_class": {
            label: {
                "precision": float(per_class[label]["precision"]),
                "recall": float(per_class[label]["recall"]),
                "f1": float(per_class[label]["f1-score"]),
                "support": int(per_class[label]["support"]),
            }
            for label in ALL_LABELS
        },
        "flagged_subset": {
            "count": len(flagged),
            "correct": flagged_correct,
            "precision": (flagged_correct / len(flagged)) if flagged else None,
        },
    }
    return metrics, predicted


def fine_tune(
    model,
    tokenizer,
    texts: list[str],
    labels: list[str],
    epochs: int,
    batch_size: int,
    learning_rate: float,
    max_length: int,
    seed: int,
) -> list[dict[str, float]]:
    """Vòng huấn luyện tay — tập nhỏ nên không cần Trainer, và như vậy kiểm soát được từng bước."""
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.train()

    encoded = tokenizer(
        texts,
        padding="max_length",
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )
    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]
    label_ids = torch.tensor([LABEL2ID[label] for label in labels], dtype=torch.long)

    weights = compute_class_weights(labels).to(device)
    loss_fn = torch.nn.CrossEntropyLoss(weight=weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)

    history: list[dict[str, float]] = []
    sample_count = len(texts)

    for epoch in range(1, epochs + 1):
        order = torch.randperm(sample_count)
        epoch_loss = 0.0
        steps = 0

        for start in range(0, sample_count, batch_size):
            batch_idx = order[start : start + batch_size]
            batch = {
                "input_ids": input_ids[batch_idx].to(device),
                "attention_mask": attention_mask[batch_idx].to(device),
            }
            logits = model(**batch).logits
            loss = loss_fn(logits, label_ids[batch_idx].to(device))

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            epoch_loss += float(loss.item())
            steps += 1

        average_loss = epoch_loss / max(1, steps)
        history.append({"epoch": epoch, "train_loss": average_loss})
        print(f"  epoch {epoch}/{epochs}: train loss {average_loss:.4f}")

    return history


def print_comparison(baseline: dict, finetuned: dict) -> None:
    print()
    print(f"  {'Chỉ số':<34}{'Gốc':>10}{'Sau fine-tune':>16}{'Chênh':>10}")
    rows = [
        ("Accuracy", "accuracy"),
        ("Macro F1 (đủ 5 nhãn)", "macro_f1_five_labels"),
        ("Macro F1 (nhãn có mặt)", "macro_f1_present_labels"),
    ]
    for title, key in rows:
        before, after = baseline[key], finetuned[key]
        print(f"  {title:<34}{before:>10.4f}{after:>16.4f}{after - before:>+10.4f}")

    for label in ALL_LABELS:
        before = baseline["per_class"][label]
        after = finetuned["per_class"][label]
        if before["support"] == 0 and after["support"] == 0:
            continue
        print(
            f"  {('Recall ' + label):<34}{before['recall']:>10.4f}{after['recall']:>16.4f}"
            f"{after['recall'] - before['recall']:>+10.4f}"
        )
    print(
        f"  {'Precision nhóm bị gắn cờ':<34}"
        f"{(baseline['flagged_subset']['precision'] or 0):>10.4f}"
        f"{(finetuned['flagged_subset']['precision'] or 0):>16.4f}"
    )
    print(
        f"  {'Số câu bị gắn cờ':<34}"
        f"{baseline['flagged_subset']['count']:>10d}"
        f"{finetuned['flagged_subset']['count']:>16d}"
    )


def write_report(path: Path, payload: dict) -> None:
    baseline = payload["baseline"]
    finetuned = payload["finetuned"]
    lines = [
        "# Fine-tune tiếp trên 200 câu calibration — kết quả",
        "",
        f"- Tập huấn luyện: **{payload['train_size']}** câu `calibration` (chỉ 3 nhãn gốc, "
        f"{payload['dropped_mixed']} câu `Mixed` bị loại vì model không có nhãn đó).",
        f"- Tập đo: **{payload['eval_size']}** câu `test` đóng băng, chấm bằng người.",
        f"- Checkpoint gốc: `{payload['checkpoint']}`; {payload['epochs']} epoch, "
        f"lr {payload['learning_rate']}, batch {payload['batch_size']}, "
        f"max_length {payload['max_length']}.",
        f"- Quy tắc khi chấm: `confidence_threshold = {payload['confidence_threshold']}`, "
        f"`mixed_clause_min_confidence = {payload['mixed_clause_min_confidence']}`.",
        "",
        "## Tự kiểm trước khi tin số mới",
        "",
        "Checkpoint gốc phải tái hiện được số đã ghi trong kế hoạch (mục 5.8) thì số của lượt "
        "fine-tune mới đáng tin:",
        "",
        "| Chỉ số | Kế hoạch ghi | Tái hiện |",
        "| --- | ---: | ---: |",
        f"| Accuracy | {RECORDED_BASELINE['accuracy']:.4f} | {baseline['accuracy']:.4f} |",
        f"| Recall `Negative` | {RECORDED_BASELINE['negative_recall']:.4f} | "
        f"{baseline['per_class']['Negative']['recall']:.4f} |",
        f"| Recall `Mixed` | {RECORDED_BASELINE['mixed_recall']:.4f} | "
        f"{baseline['per_class']['Mixed']['recall']:.4f} |",
        "",
        "## So sánh",
        "",
        "| Chỉ số | Gốc | Sau fine-tune | Chênh |",
        "| --- | ---: | ---: | ---: |",
        f"| Accuracy | {baseline['accuracy']:.4f} | {finetuned['accuracy']:.4f} | "
        f"{finetuned['accuracy'] - baseline['accuracy']:+.4f} |",
        f"| Macro F1 (đủ 5 nhãn) | {baseline['macro_f1_five_labels']:.4f} | "
        f"{finetuned['macro_f1_five_labels']:.4f} | "
        f"{finetuned['macro_f1_five_labels'] - baseline['macro_f1_five_labels']:+.4f} |",
    ]
    for label in ALL_LABELS:
        before, after = baseline["per_class"][label], finetuned["per_class"][label]
        if before["support"] == 0 and after["support"] == 0:
            continue
        lines.append(
            f"| Recall `{label}` | {before['recall']:.4f} | {after['recall']:.4f} | "
            f"{after['recall'] - before['recall']:+.4f} |"
        )
        lines.append(
            f"| Precision `{label}` | {before['precision']:.4f} | {after['precision']:.4f} | "
            f"{after['precision'] - before['precision']:+.4f} |"
        )
    lines += [
        "",
        f"- Precision nhóm bị gắn cờ: gốc {baseline['flagged_subset']['precision']}, "
        f"sau fine-tune {finetuned['flagged_subset']['precision']} "
        f"({finetuned['flagged_subset']['count']} câu).",
        "",
        "## Cách đọc kết quả này",
        "",
        "- Tập huấn luyện chỉ 147 câu, nên đây là thí nghiệm dò hướng, không phải một model để phát "
        "hành. Kết quả dương tính ở đây nghĩa là \"hướng này đáng làm tiếp với nhiều dữ liệu hơn\", "
        "không có nghĩa là đã đạt tiêu chí chấp nhận ở mục 0.5.",
        "- Tập `test` đóng băng không được dùng để chọn epoch: số epoch chốt trước, chạy xong mới "
        "xem kết quả.",
        "- Tiêu chí chấp nhận vẫn là macro F1 ≥ 0,80 và recall `Negative` ≥ 0,80. Nếu bảng trên "
        "không đạt thì kết luận là **vẫn chưa đạt**, không phải \"gần đạt\".",
        "",
        f"Tệp số liệu đầy đủ: `{payload['raw_json']}`.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checkpoint", type=Path, default=PROJECT_ROOT / "artifacts" / "phobert_checkpoint")
    parser.add_argument("--gold", type=Path, default=PROJECT_ROOT / "data" / "processed" / "local-gold.csv")
    parser.add_argument("--output-json", type=Path, default=PROJECT_ROOT / "artifacts" / "local-finetune-evaluation.json")
    parser.add_argument("--output-report", type=Path, default=PROJECT_ROOT / "artifacts" / "local-finetune-evaluation.md")
    parser.add_argument("--save-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "phobert_local_finetune")
    parser.add_argument("--no-save", action="store_true", help="Không lưu checkpoint sau khi fine-tune")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--max-length", type=int, default=256, help="Khớp MaxSequenceLength lúc chạy thật")
    parser.add_argument("--seed", type=int, default=7)
    return parser.parse_args()


def main() -> int:
    force_utf8_output()
    args = parse_args()

    rows = read_gold(args.gold)
    train_rows = [
        row for row in rows
        if row["Split"] == "calibration" and row["Sentiment"] in LABEL2ID
    ]
    dropped_mixed = sum(
        1 for row in rows if row["Split"] == "calibration" and row["Sentiment"] not in LABEL2ID
    )
    eval_rows = [row for row in rows if row["Split"] == "test"]

    if not train_rows or not eval_rows:
        print("Thiếu dữ liệu: cần cả tập calibration và tập test trong tệp gold.")
        return 1

    print(f"Tập huấn luyện: {len(train_rows)} câu (bỏ {dropped_mixed} câu không thuộc 3 nhãn gốc)")
    print(f"Tập đo (đóng băng): {len(eval_rows)} câu")
    print(f"Thiết bị: {'cuda' if torch.cuda.is_available() else 'cpu'}")

    tokenizer = load_phobert_tokenizer(str(args.checkpoint))

    # 1. Checkpoint gốc — vừa là mốc so sánh, vừa là phép tự kiểm.
    baseline_model = load_phobert_model(str(args.checkpoint))
    baseline_engine = SentimentInferenceEngine(
        make_pytorch_predict_fn(baseline_model, tokenizer, max_length=args.max_length),
        confidence_threshold=CONFIDENCE_THRESHOLD,
        mixed_clause_min_confidence=MIXED_CLAUSE_MIN_CONFIDENCE,
    )
    eval_texts = [row["Text"] for row in eval_rows]
    gold_labels = [row["Sentiment"] for row in eval_rows]

    print("\nChấm checkpoint gốc trên tập test đóng băng...")
    baseline, _ = evaluate(baseline_engine, eval_texts, gold_labels)

    drift = max(
        abs(baseline["accuracy"] - RECORDED_BASELINE["accuracy"]),
        abs(baseline["per_class"]["Negative"]["recall"] - RECORDED_BASELINE["negative_recall"]),
    )
    if drift > 0.02:
        print(
            f"  CẢNH BÁO: lệch {drift:.4f} so với số ghi trong kế hoạch. Số của lượt fine-tune "
            "bên dưới vì thế cũng chỉ so được với chính lượt chạy này, không so được với kế hoạch."
        )
    else:
        print(f"  Tái hiện khớp số đã ghi trong kế hoạch (lệch {drift:.4f}).")

    del baseline_model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # 2. Fine-tune tiếp trên tập calibration.
    print(f"\nFine-tune {args.epochs} epoch trên {len(train_rows)} câu...")
    model = load_phobert_model(str(args.checkpoint))
    history = fine_tune(
        model,
        tokenizer,
        [row["Text"] for row in train_rows],
        [row["Sentiment"] for row in train_rows],
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        max_length=args.max_length,
        seed=args.seed,
    )

    if not args.no_save:
        args.save_dir.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(args.save_dir)
        tokenizer.save_pretrained(args.save_dir)
        print(f"  Đã lưu checkpoint vào {args.save_dir}")

    # 3. Chấm lại trên đúng tập test đóng băng đó.
    print("\nChấm model sau fine-tune trên cùng tập test...")
    finetuned_engine = SentimentInferenceEngine(
        make_pytorch_predict_fn(model, tokenizer, max_length=args.max_length),
        confidence_threshold=CONFIDENCE_THRESHOLD,
        mixed_clause_min_confidence=MIXED_CLAUSE_MIN_CONFIDENCE,
    )
    finetuned, predicted = evaluate(finetuned_engine, eval_texts, gold_labels)

    print_comparison(baseline, finetuned)

    payload = {
        "checkpoint": str(args.checkpoint),
        "train_size": len(train_rows),
        "eval_size": len(eval_rows),
        "dropped_mixed": dropped_mixed,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "max_length": args.max_length,
        "seed": args.seed,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "mixed_clause_min_confidence": MIXED_CLAUSE_MIN_CONFIDENCE,
        "training_history": history,
        "recorded_baseline_in_plan": RECORDED_BASELINE,
        "reproduction_drift": drift,
        "baseline": baseline,
        "finetuned": finetuned,
        "raw_json": str(args.output_json),
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    write_report(args.output_report, payload)

    verdict = "ĐẠT" if (
        finetuned["macro_f1_five_labels"] >= 0.80
        and finetuned["per_class"]["Negative"]["recall"] >= 0.80
    ) else "CHƯA ĐẠT"
    print(f"\nKết luận so với tiêu chí chấp nhận (macro F1 ≥ 0,80 và recall Negative ≥ 0,80): {verdict}")
    print(f"Báo cáo: {args.output_report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
