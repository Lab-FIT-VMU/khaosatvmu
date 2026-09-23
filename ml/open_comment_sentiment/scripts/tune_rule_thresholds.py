"""Dò lại ngưỡng và biến thể quy tắc 5 nhãn, KHÔNG cần gán nhãn thêm và không huấn luyện lại.

Vì sao cần script này
---------------------
Hai lượt đo trên miền local (tập `test` đóng băng 200 câu và gói pilot 100 câu) đều cho cùng một
hình: **precision cao, recall thấp**. Ma trận nhầm lẫn chỉ đúng thủ phạm — `30/58` câu `Mixed` bị
đoán thành `Positive`, chỉ `13/58` đúng.

Nhưng `Mixed` **không phải** nhãn của model. Nó do quy tắc mệnh đề sinh ra trong
`inference_engine.py` (và bản port C# `OpenCommentSentimentRules.cs`). Nghĩa là chỗ hỏng có thể
nằm ở ngưỡng và cách xét mệnh đề, chứ không nhất thiết ở model. Sửa ngưỡng thì rẻ hơn huấn luyện
lại rất nhiều, nên phải loại trừ khả năng đó trước.

Quy tắc hiện tại (bản V0 — `argmax`)
------------------------------------
1. Chạy model 3 lớp trên **cả ý kiến** -> nhãn gốc + độ tin cậy gốc.
2. Tách ý kiến thành các mệnh đề theo `nhưng`/`tuy nhiên`/`mặc dù vậy`/`song`/`dẫu vậy`/`thế nhưng`,
   dấu `;`, và ranh giới câu. Nếu có từ 2 mệnh đề trở lên, hoặc câu có dấu hiệu trái chiều, thì
   chạy model trên **từng mệnh đề**.
3. `Mixed` khi tồn tại một mệnh đề mà **argmax là Positive** và một mệnh đề khác mà **argmax là
   Negative**, mỗi mệnh đề phải đạt `mixed_clause_min_confidence`.
4. `Uncertain` khi độ tin cậy của nhãn gốc dưới `confidence_threshold` và không phải `Mixed`.
5. Còn lại lấy nhãn gốc.

Chỗ đáng ngờ của bước 3: nó đòi hỏi **argmax** của mệnh đề. Một mệnh đề phàn nàn mà model gọi là
`Neutral` với `p(Negative) = 0.45` sẽ không được tính là vế tiêu cực — dù 0,45 là tín hiệu rõ.
Biến thể V1 dưới đây xét theo **khối xác suất** thay vì argmax để bắt đúng nhóm đó.

Cách làm
--------
Bước 1 dựng cache xác suất (chạy model **một lần**, ghi ra `artifacts/rule-tuning-cache.json`).
Bước 2 dò tham số trên cache, không đụng tới model nữa, nên chạy lại rất nhanh.

Kỷ luật chống tự lừa mình
-------------------------
* **Dò trên 200 câu `calibration`, báo cáo trên 200 câu `test` đóng băng.** Không dò và báo cáo
  trên cùng một tập — làm vậy thì con số thu được chỉ là kết quả của việc nhớ đề.
* Cache dùng **model ONNX**, đúng cái đang chạy trong sản phẩm, không phải checkpoint PyTorch.
* Trước khi dò, script **tái hiện lại** kết quả đã ghi trong `artifacts/phobert-local-evaluation.json`
  ở cấu hình sản phẩm (`0,45`/`0,35`). Lệch thì dừng ngay: replay mà không khớp bản gốc thì mọi kết
  luận sau đó vô nghĩa.
* Mục tiêu tối ưu là **recall của tập bị gắn cờ, với precision không xuống dưới sàn**. Đây mới là
  thứ sản phẩm cần; Macro F1 5 lớp chỉ in ra để tham khảo, vì hai ngưỡng hiện tại được chọn theo
  Macro F1 5 lớp — tối ưu một đằng dùng một nẻo là chỗ còn dư địa rõ nhất.

Hai cách tính Macro F1, phải nói rõ dùng cách nào
-------------------------------------------------
`artifacts/phobert-local-evaluation.json` ghi `macro_f1 = 0,6309` và bảng trong
`phobert-local-evaluation.md` gọi đó là "Macro F1 (5 lớp)". **Cách gọi đó sai.** Script sinh ra nó
gọi `f1_score(y_true, y_pred, average="macro")` **không truyền `labels=`**, nên sklearn chỉ lấy các
nhãn CÓ MẶT trong hai dãy — mà cả nhãn vàng lẫn nhãn dự đoán của tập test đều không có `Uncertain`,
thành ra đó là trung bình của **4 lớp**. Bảng in ra ngay bên cạnh thì lại truyền
`labels=FIVE_CLASS_LABELS`, nên có thêm dòng `Uncertain` với F1 = 0 — và trung bình của chính bảng
đó là `0,5047`, không phải `0,6309`.

Vì vậy script này tính và in CẢ HAI, gọi đúng tên:

* `macro_f1_4class` — bốn nhãn đang thật sự xuất hiện, tức cách tính của bản ghi cũ. Dùng để tự kiểm.
* `macro_f1_5class` — đủ năm nhãn khai báo, `Uncertain` đóng góp 0. Dùng để so giữa các cấu hình, vì
  tập nhãn cố định nên so được; chỉ số "nhãn có mặt" đổi tập nhãn theo từng cấu hình nên không so được.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import csv
import json
from pathlib import Path
import sys
from typing import Any

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402
from sentiment_baseline.inference_engine import (  # noqa: E402
    contains_contrast_marker,
    split_clauses,
)
from sentiment_baseline.phobert_model import LABEL_NAMES, load_phobert_tokenizer  # noqa: E402

DEFAULT_GOLD_CSV = PROJECT_ROOT / "data" / "processed" / "local-gold.csv"
DEFAULT_ONNX = PROJECT_ROOT / "artifacts" / "phobert-sentiment.onnx"
DEFAULT_MODEL_DIR = PROJECT_ROOT / "artifacts" / "phobert_checkpoint"
DEFAULT_CACHE = PROJECT_ROOT / "artifacts" / "rule-tuning-cache.json"
DEFAULT_RECORDED = PROJECT_ROOT / "artifacts" / "phobert-local-evaluation.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "artifacts" / "rule-tuning.json"

FIVE_CLASS_LABELS = ("Negative", "Neutral", "Positive", "Mixed", "Uncertain")
# Lớp được dùng để gắn cờ cho giảng viên. Đây là mục đích thật của tính năng.
FLAGGED_LABELS = ("Negative", "Mixed")

# Cấu hình đang chạy trong sản phẩm (appsettings.json + OpenCommentSentimentRules.cs).
PRODUCTION_CONFIDENCE_THRESHOLD = 0.45
PRODUCTION_MIXED_CLAUSE_CONFIDENCE = 0.35


def labels_from_probs(probs: list[float]) -> tuple[str, float]:
    """Nhãn argmax và độ tin cậy của nó. Bằng nhau thì lấy vị trí đầu, đúng như numpy.argmax."""
    best = 0
    for index in range(1, len(probs)):
        if probs[index] > probs[best]:
            best = index
    return LABEL_NAMES[best], float(probs[best])


def build_cache(
    gold_csv: Path,
    onnx_path: Path,
    model_dir: Path,
    cache_path: Path,
    batch_size: int,
) -> dict[str, Any]:
    """Chạy model một lần cho mọi ý kiến và mọi mệnh đề, ghi lại xác suất để dò lại nhiều lần."""
    import onnxruntime as ort

    from sentiment_baseline.inference_engine import make_onnx_predict_fn

    with gold_csv.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))

    tokenizer = load_phobert_tokenizer(str(model_dir))
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    predict_proba = make_onnx_predict_fn(session, tokenizer, batch_size=batch_size)

    texts = [row["Text"] for row in rows]
    print(f"Chạy model trên {len(texts)} ý kiến...")
    base_probs = predict_proba(texts)

    # Mệnh đề: gom mọi mệnh đề cần chạy thành một lô duy nhất, giống engine gốc.
    clauses_by_row: list[list[str]] = []
    clause_texts: list[str] = []
    for text in texts:
        clauses = split_clauses(text)
        # Engine gốc chỉ chạy mệnh đề khi có >= 2 mệnh đề hoặc có dấu hiệu trái chiều; bằng không
        # nó dùng luôn xác suất của cả ý kiến. Đánh dấu để replay làm y hệt.
        if len(clauses) >= 2 or contains_contrast_marker(text):
            clauses_by_row.append(clauses)
            clause_texts.extend(clauses)
        else:
            clauses_by_row.append([])

    clause_probs: list[list[float]] = []
    if clause_texts:
        print(f"Chạy model trên {len(clause_texts)} mệnh đề...")
        flat = predict_proba(clause_texts)
        clause_probs = [[float(value) for value in row] for row in flat]

    entries: list[dict[str, Any]] = []
    cursor = 0
    for index, row in enumerate(rows):
        own_clauses = clauses_by_row[index]
        clause_payload = []
        for clause in own_clauses:
            clause_payload.append(
                {"text": clause, "probs": clause_probs[cursor]}
            )
            cursor += 1
        entries.append(
            {
                "SampleId": row["SampleId"],
                "Split": row["Split"],
                "Gold": row["Sentiment"],
                "Text": row["Text"],
                "BaseProbs": [float(value) for value in base_probs[index]],
                "Clauses": clause_payload,
            }
        )

    cache = {
        "onnx_model": str(onnx_path),
        # Ghi lại ngưỡng cắt mệnh đề đang dùng, để nếu sau này sửa `split_clauses` thì thấy ngay
        # là cache cũ đã lạc hậu và phải dựng lại.
        "clause_min_tokens": 2,
        "clause_min_chars": 3,
        "entries": entries,
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"Đã ghi cache: {cache_path}")
    return cache


def load_cache(cache_path: Path) -> dict[str, Any]:
    return json.loads(cache_path.read_text(encoding="utf-8"))


def predict_entry(
    entry: dict[str, Any],
    confidence_threshold: float,
    mixed_clause_min_confidence: float,
    mixed_rule: str,
) -> tuple[str, float]:
    """Chạy lại quy tắc 5 nhãn trên xác suất đã cache. Đây là bản replay của engine gốc."""
    base_probs = entry["BaseProbs"]
    base_label, base_confidence = labels_from_probs(base_probs)
    clauses = entry["Clauses"]

    has_positive_clause = False
    has_negative_clause = False
    positive_clause_confidences: list[float] = []
    negative_clause_confidences: list[float] = []

    if not clauses:
        # Engine gốc: không mệnh đề riêng thì mệnh đề duy nhất chính là cả ý kiến.
        clauses = [{"text": entry["Text"], "probs": base_probs}]

    for clause in clauses:
        probs = clause["probs"]
        if mixed_rule == "argmax":
            # V0 — đúng bản sản phẩm: mệnh đề phải có argmax là cực đó.
            label, confidence = labels_from_probs(probs)
            if label == "Positive" and confidence >= mixed_clause_min_confidence:
                has_positive_clause = True
                positive_clause_confidences.append(confidence)
            elif label == "Negative" and confidence >= mixed_clause_min_confidence:
                has_negative_clause = True
                negative_clause_confidences.append(confidence)
        elif mixed_rule == "mass":
            # V1 — xét khối xác suất thay vì argmax. Bắt được mệnh đề phàn nàn mà model gọi là
            # Neutral nhưng cho p(Negative) khá cao; V0 bỏ sót đúng nhóm này.
            negative_mass = float(probs[0])
            positive_mass = float(probs[2])
            if positive_mass >= mixed_clause_min_confidence:
                has_positive_clause = True
                positive_clause_confidences.append(positive_mass)
            elif negative_mass >= mixed_clause_min_confidence:
                has_negative_clause = True
                negative_clause_confidences.append(negative_mass)
        else:
            raise ValueError(f"Biến thể quy tắc không hợp lệ: {mixed_rule!r}")

    is_mixed = has_positive_clause and has_negative_clause
    is_uncertain = (base_confidence < confidence_threshold) and not is_mixed

    if is_mixed:
        return "Mixed", min(
            max(positive_clause_confidences), max(negative_clause_confidences)
        )
    if is_uncertain:
        return "Uncertain", base_confidence
    return base_label, base_confidence


def score(
    y_true: list[str],
    y_pred: list[str],
) -> dict[str, Any]:
    """Chỉ số 5 lớp + chỉ số của tập bị gắn cờ (thứ sản phẩm thật sự cần)."""
    per_class: dict[str, dict[str, float]] = {}
    for label in FIVE_CLASS_LABELS:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[label] = {
            "support": tp + fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }

    accuracy = (
        sum(1 for t, p in zip(y_true, y_pred) if t == p) / len(y_true) if y_true else 0.0
    )
    macro_f1_5class = sum(item["f1"] for item in per_class.values()) / len(per_class)
    # Cách tính của bản ghi cũ: chỉ lấy nhãn có mặt, giống sklearn khi không truyền `labels=`.
    present = [label for label in FIVE_CLASS_LABELS if label in set(y_true) | set(y_pred)]
    macro_f1_4class = (
        sum(per_class[label]["f1"] for label in present) / len(present) if present else 0.0
    )

    # Tập bị gắn cờ: THỰC TẾ có phải lớp cần cảnh báo hay không, so với MÔ HÌNH có gắn cờ hay không.
    should_flag = [t in FLAGGED_LABELS for t in y_true]
    did_flag = [p in FLAGGED_LABELS for p in y_pred]
    flagged_tp = sum(1 for s, d in zip(should_flag, did_flag) if s and d)
    flagged_fp = sum(1 for s, d in zip(should_flag, did_flag) if not s and d)
    flagged_fn = sum(1 for s, d in zip(should_flag, did_flag) if s and not d)
    flagged_precision = (
        flagged_tp / (flagged_tp + flagged_fp) if flagged_tp + flagged_fp else 0.0
    )
    flagged_recall = (
        flagged_tp / (flagged_tp + flagged_fn) if flagged_tp + flagged_fn else 0.0
    )

    return {
        "accuracy": round(accuracy, 4),
        "macro_f1_5class": round(macro_f1_5class, 4),
        "macro_f1_4class": round(macro_f1_4class, 4),
        "labels_present": present,
        "per_class": per_class,
        "flagged": {
            "should_flag": sum(should_flag),
            "did_flag": sum(did_flag),
            "true_positive": flagged_tp,
            "false_positive": flagged_fp,
            "false_negative": flagged_fn,
            "precision": round(flagged_precision, 4),
            "recall": round(flagged_recall, 4),
        },
    }


def run_config(
    entries: list[dict[str, Any]],
    confidence_threshold: float,
    mixed_clause_min_confidence: float,
    mixed_rule: str,
) -> dict[str, Any]:
    y_true = [entry["Gold"] for entry in entries]
    y_pred = [
        predict_entry(entry, confidence_threshold, mixed_clause_min_confidence, mixed_rule)[0]
        for entry in entries
    ]
    return score(y_true, y_pred)


def verify_replay(cache: dict[str, Any], recorded_path: Path) -> None:
    """Replay phải tái hiện đúng con số đã ghi. Lệch nghĩa là replay sai, dừng ngay."""
    if not recorded_path.exists():
        print("Không có bản ghi cũ để đối chiếu; bỏ qua bước tự kiểm.")
        return

    recorded = json.loads(recorded_path.read_text(encoding="utf-8"))["evaluation"]
    test_entries = [e for e in cache["entries"] if e["Split"] == "test"]
    replay = run_config(
        test_entries,
        PRODUCTION_CONFIDENCE_THRESHOLD,
        PRODUCTION_MIXED_CLAUSE_CONFIDENCE,
        "argmax",
    )

    recorded_acc = float(recorded["accuracy"])
    recorded_f1 = float(recorded["macro_f1"])
    present_f1 = replay["macro_f1_4class"]
    print("\n--- Tự kiểm: replay so với bản ghi artifacts/phobert-local-evaluation.json ---")
    print(f"Accuracy                ghi lại {recorded_acc:.4f} | replay {replay['accuracy']:.4f}")
    print(f"Macro F1 (4 lớp, bản ghi) ghi lại {recorded_f1:.4f} | replay {present_f1:.4f}")
    print(
        f"Macro F1 (đủ 5 lớp)      replay {replay['macro_f1_5class']:.4f} "
        "(bản ghi không có số này; bảng của nó mới có)"
    )

    recorded_matrix = recorded.get("confusion_matrix", {})
    if recorded_matrix:
        labels = recorded_matrix["labels"]
        matrix = recorded_matrix["matrix"]
        replay_pred = [
            predict_entry(
                e,
                PRODUCTION_CONFIDENCE_THRESHOLD,
                PRODUCTION_MIXED_CLAUSE_CONFIDENCE,
                "argmax",
            )[0]
            for e in test_entries
        ]
        y_true = [e["Gold"] for e in test_entries]
        mismatch = 0
        for true_index, true_label in enumerate(labels):
            for pred_index, pred_label in enumerate(labels):
                expected = int(matrix[true_index][pred_index])
                actual = sum(
                    1
                    for t, p in zip(y_true, replay_pred)
                    if t == true_label and p == pred_label
                )
                mismatch += abs(expected - actual)
        print(f"Ô ma trận nhầm lẫn lệch tổng cộng: {mismatch}")
        if mismatch != 0:
            raise SystemExit(
                "Replay không tái hiện được ma trận nhầm lẫn đã ghi. Dừng: kết luận dò tham số "
                "sẽ vô nghĩa nếu replay không khớp bản gốc."
            )

    if abs(replay["accuracy"] - recorded_acc) > 1e-6 or abs(present_f1 - recorded_f1) > 1e-4:
        raise SystemExit(
            "Replay lệch so với bản ghi cũ. Dừng trước khi dò tham số."
        )
    print("Replay khớp bản ghi. Tiếp tục dò tham số.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tune the 5-label rule thresholds on cached ONNX probabilities."
    )
    parser.add_argument("--gold-csv", type=Path, default=DEFAULT_GOLD_CSV)
    parser.add_argument("--onnx", type=Path, default=DEFAULT_ONNX)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--recorded", type=Path, default=DEFAULT_RECORDED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument(
        "--rebuild-cache",
        action="store_true",
        help="Chạy lại model để dựng cache mới, kể cả khi cache đã có.",
    )
    parser.add_argument(
        "--precision-floor",
        type=float,
        default=0.85,
        help="Sàn precision của tập bị gắn cờ. Dưới sàn thì không xét dù recall cao.",
    )
    return parser.parse_args()


def main() -> int:
    force_utf8_output()
    args = parse_args()

    cache_path = args.cache.resolve()
    if args.rebuild_cache or not cache_path.exists():
        cache = build_cache(
            args.gold_csv.resolve(),
            args.onnx.resolve(),
            args.model_dir.resolve(),
            cache_path,
            args.batch_size,
        )
    else:
        print(f"Dùng cache có sẵn: {cache_path} (thêm --rebuild-cache để chạy lại model)")
        cache = load_cache(cache_path)

    verify_replay(cache, args.recorded.resolve())

    calibration = [e for e in cache["entries"] if e["Split"] == "calibration"]
    frozen_test = [e for e in cache["entries"] if e["Split"] == "test"]

    # Lưới phải rộng hơn "vùng hợp lý" một chút: lần dò đầu chọn đúng giá trị nhỏ nhất của cả hai
    # trục, tức điểm tối ưu nằm ở mép lưới và chưa biết thật sự ở đâu. Mép lưới là câu trả lời dở.
    confidence_grid = [round(0.10 + 0.05 * i, 2) for i in range(13)]  # 0.10 .. 0.70
    mixed_grid = [round(0.05 + 0.05 * i, 2) for i in range(12)]  # 0.05 .. 0.60
    rules = ["argmax", "mass"]

    print(
        f"\nDò {len(confidence_grid)} x {len(mixed_grid)} ngưỡng x {len(rules)} biến thể "
        f"trên {len(calibration)} câu calibration."
    )

    results: list[dict[str, Any]] = []
    for rule in rules:
        for confidence in confidence_grid:
            for mixed in mixed_grid:
                metrics = run_config(calibration, confidence, mixed, rule)
                results.append(
                    {
                        "mixed_rule": rule,
                        "confidence_threshold": confidence,
                        "mixed_clause_min_confidence": mixed,
                        **metrics,
                    }
                )

    def objective(item: dict[str, Any]) -> tuple[float, float, float]:
        return (
            item["flagged"]["recall"] if item["flagged"]["precision"] >= args.precision_floor else -1.0,
            item["flagged"]["precision"],
            item["macro_f1_5class"],
        )
    def summarise(title: str, picked: dict[str, Any], baseline: dict[str, Any]) -> list[str]:
        lines = [f"### {title}", ""]
        test_metrics = run_config(
            frozen_test,
            picked["confidence_threshold"],
            picked["mixed_clause_min_confidence"],
            picked["mixed_rule"],
        )
        baseline_test = run_config(
            frozen_test,
            baseline["confidence_threshold"],
            baseline["mixed_clause_min_confidence"],
            baseline["mixed_rule"],
        )
        delta = test_metrics["flagged"]["recall"] - baseline_test["flagged"]["recall"]
        lines += [
            f"- Biến thể quy tắc: `{picked['mixed_rule']}`"
            f" (sản phẩm đang dùng `{baseline['mixed_rule']}`)",
            f"- `confidence_threshold` = `{picked['confidence_threshold']}`"
            f" (đang là `{baseline['confidence_threshold']}`)",
            f"- `mixed_clause_min_confidence` = `{picked['mixed_clause_min_confidence']}`"
            f" (đang là `{baseline['mixed_clause_min_confidence']}`)",
            "",
            "| Chỉ số trên tập TEST đóng băng | Sản phẩm | Cấu hình này | Chênh |",
            "|---|---:|---:|---:|",
            f"| Recall tập bị gắn cờ | {baseline_test['flagged']['recall']:.4f} | "
            f"{test_metrics['flagged']['recall']:.4f} | {delta:+.4f} |",
            f"| Precision tập bị gắn cờ | {baseline_test['flagged']['precision']:.4f} | "
            f"{test_metrics['flagged']['precision']:.4f} | "
            f"{test_metrics['flagged']['precision'] - baseline_test['flagged']['precision']:+.4f} |",
            f"| Accuracy | {baseline_test['accuracy']:.4f} | {test_metrics['accuracy']:.4f} | "
            f"{test_metrics['accuracy'] - baseline_test['accuracy']:+.4f} |",
            f"| Macro F1 (đủ 5 lớp) | {baseline_test['macro_f1_5class']:.4f} | "
            f"{test_metrics['macro_f1_5class']:.4f} | "
            f"{test_metrics['macro_f1_5class'] - baseline_test['macro_f1_5class']:+.4f} |",
            f"| Recall `Negative` | {baseline_test['per_class']['Negative']['recall']:.4f} | "
            f"{test_metrics['per_class']['Negative']['recall']:.4f} | "
            f"{test_metrics['per_class']['Negative']['recall'] - baseline_test['per_class']['Negative']['recall']:+.4f} |",
            f"| Recall `Mixed` | {baseline_test['per_class']['Mixed']['recall']:.4f} | "
            f"{test_metrics['per_class']['Mixed']['recall']:.4f} | "
            f"{test_metrics['per_class']['Mixed']['recall'] - baseline_test['per_class']['Mixed']['recall']:+.4f} |",
            "",
            "Chi tiết từng lớp ở cấu hình này:",
            "",
            "| Lớp | Precision | Recall | F1 | Số câu thật |",
            "|---|---:|---:|---:|---:|",
        ]
        for label in FIVE_CLASS_LABELS:
            item = test_metrics["per_class"][label]
            lines.append(
                f"| {label} | {item['precision']:.4f} | {item['recall']:.4f} | "
                f"{item['f1']:.4f} | {int(item['support'])} |"
            )
        lines.append("")
        return lines

    production = next(
        item
        for item in results
        if item["mixed_rule"] == "argmax"
        and item["confidence_threshold"] == PRODUCTION_CONFIDENCE_THRESHOLD
        and item["mixed_clause_min_confidence"] == PRODUCTION_MIXED_CLAUSE_CONFIDENCE
    )
    production_test = run_config(
        frozen_test,
        PRODUCTION_CONFIDENCE_THRESHOLD,
        PRODUCTION_MIXED_CLAUSE_CONFIDENCE,
        "argmax",
    )

    # Ràng buộc chống thoái bộ, rút ra từ chính lượt dò đầu tiên.
    #
    # Tập bị gắn cờ gồm CẢ `Negative` lẫn `Mixed`, nên đổi nhãn một câu từ `Negative` sang `Mixed`
    # không làm precision của tập đó giảm — trong khi đó là lỗi thật: câu phàn nàn thuần bị ghi
    # thành "Hỗn hợp". Lượt dò đầu (không có ràng buộc này) chọn `confidence_threshold = 0,6` và
    # recall `Negative` trên tập test sụp từ `0,5385` xuống `0,1795` mà flagged recall vẫn tăng.
    # Vì vậy phải chặn thẳng: recall `Negative` không được thấp hơn cấu hình đang chạy.
    negative_guard = production["per_class"]["Negative"]["recall"]

    def passes_constraints(item: dict[str, Any]) -> bool:
        return (
            item["flagged"]["precision"] >= args.precision_floor
            and item["per_class"]["Negative"]["recall"] >= negative_guard
        )

    feasible = [item for item in results if passes_constraints(item)]
    dropped_precision = sum(
        1 for item in results if item["flagged"]["precision"] < args.precision_floor
    )
    dropped_negative = sum(
        1
        for item in results
        if item["flagged"]["precision"] >= args.precision_floor
        and item["per_class"]["Negative"]["recall"] < negative_guard
    )
    if not feasible:
        raise SystemExit(
            "Không cấu hình nào đạt cả hai ràng buộc. Nới sàn precision hoặc chấp nhận kết luận "
            "rằng quy tắc hiện tại không sửa được bằng ngưỡng."
        )
    best_overall = max(feasible, key=objective)
    best_argmax = max((item for item in feasible if item["mixed_rule"] == "argmax"), key=objective)

    lines = [
        "# Dò ngưỡng quy tắc 5 nhãn trên tập gold local",
        "",
        "Dò trên 200 câu `calibration`, báo cáo trên 200 câu `test` đóng băng.",
        "Mục tiêu: **recall của tập bị gắn cờ** (`Negative` hoặc `Mixed`), với hai ràng buộc:",
        f"precision của tập bị gắn cờ không xuống dưới sàn `{args.precision_floor}`, và recall",
        f"`Negative` không thấp hơn cấu hình đang chạy (`{negative_guard:.4f}`).",
        "",
        f"Số cấu hình đã thử: {len(results)}.",
        f"Bị loại vì precision dưới sàn: {dropped_precision}.",
        f"Bị loại vì recall `Negative` thoái bộ: {dropped_negative}.",
        f"Còn lại đủ điều kiện: {len(feasible)}.",
        "",
        "## Cấu hình đang chạy trong sản phẩm",
        "",
        f"`{production['mixed_rule']}`, `{PRODUCTION_CONFIDENCE_THRESHOLD}` / "
        f"`{PRODUCTION_MIXED_CLAUSE_CONFIDENCE}`.",
        "",
        "| Chỉ số trên tập TEST đóng băng | Giá trị |",
        "|---|---:|",
        f"| Recall tập bị gắn cờ | {production_test['flagged']['recall']:.4f} |",
        f"| Precision tập bị gắn cờ | {production_test['flagged']['precision']:.4f} |",
        f"| Accuracy | {production_test['accuracy']:.4f} |",
        f"| Macro F1 (đủ 5 lớp) | {production_test['macro_f1_5class']:.4f} |",
        f"| Macro F1 (4 lớp, cách tính của bản ghi cũ) | {production_test['macro_f1_4class']:.4f} |",
        f"| Recall `Negative` | {production_test['per_class']['Negative']['recall']:.4f} |",
        f"| Recall `Mixed` | {production_test['per_class']['Mixed']['recall']:.4f} |",
        "",
        "## Kết quả dò",
        "",
    ]
    lines += summarise("A. Chỉ đổi hai con số (không phải sửa C#)", best_argmax, production)
    lines += summarise("B. Tốt nhất nếu cho phép đổi cả cách xét mệnh đề", best_overall, production)

    if best_overall["mixed_rule"] != best_argmax["mixed_rule"]:
        gain = best_overall["flagged"]["recall"] - best_argmax["flagged"]["recall"]
        lines += [
            f"Đổi cách xét mệnh đề (`argmax` -> `mass`) thêm `{gain:+.4f}` recall trên tập calibration.",
            "Muốn dùng thì phải sửa cả `OpenCommentSentimentRules.cs`, sinh lại fixture đối chiếu",
            "Python–C#, rồi mới chạy test — không phải chỉnh appsettings là xong.",
            "",
        ]
    else:
        lines += [
            "Không cần đổi cách xét mệnh đề: cấu hình tốt nhất vẫn nằm trong biến thể đang chạy,",
            "nên chỉ cần đổi hai con số trong `appsettings.json` và hằng số ở hai phía C#/Python.",
            "",
        ]

    lines += [
        "## Năm cấu hình tốt nhất (trên tập CALIBRATION, đã qua ràng buộc)",
        "",
        "Các cột cuối là chỉ số trên tập calibration, tức tập dùng để chọn — không phải tập báo cáo.",
        "",
        "| Quy tắc | conf | mixed | Flagged recall | Flagged precision | Recall Neg | Macro F1 5 lớp | Accuracy |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for item in sorted(feasible, key=objective, reverse=True)[:5]:
        lines.append(
            f"| `{item['mixed_rule']}` | {item['confidence_threshold']} | "
            f"{item['mixed_clause_min_confidence']} | {item['flagged']['recall']:.4f} | "
            f"{item['flagged']['precision']:.4f} | {item['per_class']['Negative']['recall']:.4f} | "
            f"{item['macro_f1_5class']:.4f} | {item['accuracy']:.4f} |"
        )

    lines += [
        "",
        "## Điều script này KHÔNG làm được",
        "",
        "Dò ngưỡng chỉ đổi được **ranh giới quyết định** trên xác suất đã có, không làm model phân biệt",
        "tốt hơn. Nếu trần của nó vẫn dưới tiêu chí `0,80` ở mục 0.5 của kế hoạch thì vẫn phải quay lại",
        "dữ liệu và huấn luyện. Cũng vì dò trên 200 câu nên kết quả có sai số chọn mẫu: chênh lệch",
        "dưới vài điểm phần trăm giữa hai cấu hình là chưa kết luận được.",
        "",
    ]

    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path = output_path.with_suffix(".md")
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    print(f"Đã ghi: {output_path} và {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
