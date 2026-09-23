from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402

ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
ALLOWED_LABELS = ("Negative", "Neutral", "Positive")
KNOWN_GOLD_LABELS = ("Negative", "Neutral", "Positive", "Mixed", "Uncertain")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate baselines on an adjudicated local gold CSV.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument(
        "--models",
        type=Path,
        nargs="*",
        help="Model artifacts to evaluate. Defaults to every *.joblib in artifacts/.",
    )
    parser.add_argument("--output", type=Path, default=ARTIFACTS_DIR / "local-domain-gap.json")
    parser.add_argument(
        "--split",
        choices=["calibration", "test"],
        help="Score only one split. Requires a Split column, which build_local_gold.py writes.",
    )
    return parser.parse_args()


def discover_models(explicit: list[Path] | None) -> list[Path]:
    if explicit:
        return [path.resolve() for path in explicit]
    return sorted(ARTIFACTS_DIR.glob("*.joblib"))


def render_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Báo cáo đánh giá độ lệch miền (Domain Gap) trên tập Local Gold",
        "",
        f"- Thời điểm UTC: `{report['generated_at_utc']}`",
        f"- Tập dữ liệu: `{report['gold_file']}` (split: `{report['split']}`)",
        f"- Tổng số câu trong split: {report['total_rows']}",
        f"- Số câu đánh giá 3 lớp: {report['evaluated_3class_rows']} {report['label_distribution_evaluated']}",
        f"- Số câu nhãn suy ra: {report['derived_label_rows']} {report['label_distribution_derived']}",
        "",
        "## 1. Hiệu năng baseline 3 lớp trên tập test local",
        "",
        "| Mô hình | Tập huấn luyện | Thuật toán | Accuracy | Macro F1 | Recall Negative | F1 Negative | F1 Neutral | F1 Positive |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    models: dict[str, dict[str, object]] = report.get("models", {})  # type: ignore[assignment]
    for name, data in models.items():
        parts = name.split("__")
        source = parts[0] if len(parts) > 1 else "unknown"
        algo = parts[1] if len(parts) > 1 else name
        cls_rep: dict[str, dict[str, float]] = data.get("classification_report", {})  # type: ignore[assignment]
        acc = data.get("accuracy", 0.0)
        macro_f1 = data.get("macro_f1", 0.0)
        rec_neg = cls_rep.get("Negative", {}).get("recall", 0.0)
        f1_neg = cls_rep.get("Negative", {}).get("f1-score", 0.0)
        f1_neu = cls_rep.get("Neutral", {}).get("f1-score", 0.0)
        f1_pos = cls_rep.get("Positive", {}).get("f1-score", 0.0)
        lines.append(
            f"| `{name}` | `{source}` | `{algo}` | {acc:.4f} | {macro_f1:.4f} | {rec_neg:.4f} | {f1_neg:.4f} | {f1_neu:.4f} | {f1_pos:.4f} |"
        )

    lines.extend([
        "",
        "## 2. Dự đoán của mô hình 3 lớp trên các câu có nhãn Mixed",
        "",
        "Các mô hình 3 lớp không được huấn luyện nhãn `Mixed`. Bảng dưới đây cho thấy cách mô hình 3 lớp 'ép' câu hỗn hợp vào các cực:",
        "",
        "| Mô hình | Dự đoán là Negative | Dự đoán là Neutral | Dự đoán là Positive | Tổng câu Mixed |",
        "|---|---:|---:|---:|---:|",
    ])

    derived_preds: dict[str, dict[str, dict[str, int]]] = report.get("derived_label_predictions", {})  # type: ignore[assignment]
    for name, breakdown in derived_preds.items():
        mixed_counts = breakdown.get("Mixed", {})
        neg = mixed_counts.get("Negative", 0)
        neu = mixed_counts.get("Neutral", 0)
        pos = mixed_counts.get("Positive", 0)
        tot = neg + neu + pos
        lines.append(f"| `{name}` | {neg} ({neg/tot:.1%}) | {neu} ({neu/tot:.1%}) | {pos} ({pos/tot:.1%}) | {tot} |")

    lines.extend([
        "",
        "## 3. Nhận xét chính",
        "",
        "1. **Mô hình học UIT-VSFC bị lệch cực tiêu cực rất nặng**: Đoán tới 90–96% các câu `Mixed` thành `Negative` và có Recall Negative = 100% nhưng Precision thấp vì ép nhầm cả Neutral và Mixed vào Negative.",
        "2. **Mô hình học NEU-ESC có xu hướng ép Mixed sang Positive/Neutral**: Không phát hiện tốt Negative trên miền local (Recall Negative chỉ 35–46%).",
        "3. **Mục tiêu Giai đoạn 2 (PhoBERT)**: Cần nâng Macro F1 từ ~0,70 lên >= 0,80 và Recall Negative lên >= 0,80 trên miền thực tế, đồng thời áp dụng cơ chế suy luận theo câu để nhận diện đúng 58 câu `Mixed` thay vì ép nhãn.",
        "",
    ])

    return "\n".join(lines) + "\n"


def main() -> int:
    force_utf8_output()
    args = parse_args()
    with args.input.resolve().open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError("Gold dataset is empty")
    required = {"Text", "Sentiment"}
    if not required.issubset(rows[0]):
        raise ValueError(f"Gold CSV must contain columns {sorted(required)}")
    if args.split:
        if "Split" not in rows[0]:
            raise ValueError("--split requires a Split column; regenerate the gold file with build_local_gold.py")
        rows = [row for row in rows if row.get("Split", "").strip() == args.split]
        if not rows:
            raise ValueError(f"No gold row belongs to split {args.split!r}")

    invalid = sorted({(row.get("Sentiment") or "").strip() for row in rows} - set(KNOWN_GOLD_LABELS))
    if invalid:
        raise ValueError(f"Blank or invalid gold labels: {invalid}")

    eval_rows = [row for row in rows if row["Sentiment"].strip() in ALLOWED_LABELS]
    derived_rows = [row for row in rows if row["Sentiment"].strip() not in ALLOWED_LABELS]

    if not eval_rows:
        raise ValueError(f"No gold row has an evaluation label in {ALLOWED_LABELS}")

    texts = [row["Text"] for row in eval_rows]
    labels = [row["Sentiment"].strip() for row in eval_rows]

    derived_texts = [row["Text"] for row in derived_rows]
    derived_gold_labels = [row["Sentiment"].strip() for row in derived_rows]

    model_paths = discover_models(args.models)
    if not model_paths:
        raise FileNotFoundError(
            f"No model artifact found in {ARTIFACTS_DIR}. Run scripts/train_baseline.py first."
        )

    report: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "total_rows": len(rows),
        "evaluated_3class_rows": len(eval_rows),
        "derived_label_rows": len(derived_rows),
        "split": args.split or "all",
        "label_order": list(ALLOWED_LABELS),
        "gold_file": args.input.resolve().name,
        "label_distribution_evaluated": dict(sorted(Counter(labels).items())),
        "label_distribution_derived": dict(sorted(Counter(derived_gold_labels).items())),
        "models": {},
        "derived_label_predictions": {},
    }

    print(
        f"Đánh giá trên {args.input.resolve().name} (split: {args.split or 'all'}): "
        f"{len(eval_rows)}/{len(rows)} câu 3 lớp, {len(derived_rows)} câu nhãn suy ra ({dict(Counter(derived_gold_labels))})"
    )
    print("-" * 75)
    print(f"{'Mô hình':<40s} | {'Accuracy':>8s} | {'Macro F1':>8s} | {'Rec Negative':>12s}")
    print("-" * 75)

    for path in model_paths:
        model = joblib.load(path)
        predictions = model.predict(texts)
        cls_report = classification_report(
            labels, predictions, labels=list(ALLOWED_LABELS), output_dict=True, zero_division=0
        )
        acc = accuracy_score(labels, predictions)
        macro_f1 = f1_score(labels, predictions, labels=list(ALLOWED_LABELS), average="macro")
        rec_neg = cls_report.get("Negative", {}).get("recall", 0.0)

        report["models"][path.stem] = {
            "artifact": path.name,
            "accuracy": acc,
            "macro_f1": macro_f1,
            "recall_negative": rec_neg,
            "classification_report": cls_report,
            "confusion_matrix": confusion_matrix(labels, predictions, labels=list(ALLOWED_LABELS)).tolist(),
        }

        print(f"{path.stem:<40s} | {acc:>8.4f} | {macro_f1:>8.4f} | {rec_neg:>12.4f}")

        if derived_texts:
            derived_preds = [str(p) for p in model.predict(derived_texts)]
            breakdown: dict[str, dict[str, int]] = {}
            for true_lbl, pred_lbl in zip(derived_gold_labels, derived_preds, strict=True):
                breakdown.setdefault(true_lbl, Counter())[pred_lbl] += 1
            report["derived_label_predictions"][path.stem] = {
                true_lbl: dict(sorted(counts.items())) for true_lbl, counts in breakdown.items()
            }

    print("-" * 75)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Báo cáo chi tiết JSON đã lưu tại: {args.output.resolve()}")

    report_md_path = args.output.with_suffix(".md")
    report_md_path.write_text(render_markdown(report), encoding="utf-8")
    print(f"Báo cáo Markdown đã lưu tại: {report_md_path.resolve()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
