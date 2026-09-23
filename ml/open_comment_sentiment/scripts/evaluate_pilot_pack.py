"""Chấm điểm gói pilot: đối chiếu nhãn chuyên viên chấm tay với nhãn mô hình đã đoán.

Đầu vào là hai tệp do ``build_pilot_review_pack.py`` sinh ra:

* ``pilot-annotation-sheet.csv`` — chuyên viên điền cột ``Sentiment``.
* ``pilot-model-predictions.csv`` — nhãn mô hình đoán, phải để riêng lúc chấm.

Báo cáo có hai phần vì hiểu sai phần nào cũng dẫn tới quyết định sai:

1. **Chất lượng phân loại** — precision/recall/F1 từng lớp. Đây là con số trả lời
   "mô hình có phân biệt nổi lớp âm không".
2. **Chất lượng khi dùng thật** — nếu chỉ tin những câu có độ tin cậy ≥ ngưỡng thì
   trong số câu bị gắn cờ, bao nhiêu phần trăm thật sự là âm. Một mô hình có recall
   thấp vẫn dùng được nếu phần nó dám khẳng định là chắc; nhưng nếu precision ở
   ngưỡng cao cũng thấp thì không nên hiện cảnh báo nào cả.

Câu ``Uncertain`` (chuyên viên không đủ ngữ cảnh để chốt) bị loại khỏi mọi phép
tính và chỉ được đếm riêng — tính chúng là đoán sai sẽ làm mô hình trông tệ hơn
thực tế một cách vô cớ.

**Mẫu được lấy phân tầng theo nhãn mô hình đoán** (25 câu mỗi nhãn), nên phân bố lớp
trong mẫu KHÔNG phải phân bố thật: thật ra tập đã phân tích là 61 Negative, 176
Neutral, 214 Positive, 39 Mixed. Hệ quả:

* **Precision đọc trực tiếp được**, vì precision có điều kiện theo "mô hình đã đoán gì"
  và mỗi tầng dự đoán đều được lấy ngẫu nhiên đủ 25 câu.
* **Recall, F1, accuracy thì không.** Tính thẳng trên mẫu là tính trên một phân bố lớp
  nhân tạo (25/25/25/25), đúng loại lỗi đã làm con số tập trộn của Giai đoạn 1 bị thổi
  lên. Phải nhân lại mỗi tầng cho đúng tỷ lệ thật của nó — đó là việc của mục 3.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import csv
import json
import math
from pathlib import Path
import random
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from sentiment_baseline.console import force_utf8_output

DEFAULT_PACK_DIR = PROJECT_ROOT / "data" / "processed" / "pilot"
DEFAULT_REPORT_DIR = PROJECT_ROOT / "artifacts"

LABELS = ("Negative", "Neutral", "Positive", "Mixed")
EXCLUDED_LABELS = {"Uncertain", ""}
# Lớp nào đáng để cảnh báo cho giảng viên. Đây là mục đích thật của tính năng.
FLAGGED_LABELS = {"Negative", "Mixed"}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Khoảng tin cậy Wilson — dùng được cả khi tỷ lệ gần 0 hoặc 1, khác khoảng Wald."""
    if total == 0:
        return (0.0, 0.0)
    phat = successes / total
    denominator = 1 + z * z / total
    center = (phat + z * z / (2 * total)) / denominator
    margin = z * math.sqrt(phat * (1 - phat) / total + z * z / (4 * total * total)) / denominator
    return (max(0.0, center - margin), min(1.0, center + margin))


def per_class_metrics(pairs: list[tuple[str, str]]) -> dict[str, dict[str, float]]:
    metrics: dict[str, dict[str, float]] = {}
    for label in LABELS:
        true_positive = sum(1 for truth, guess in pairs if truth == label and guess == label)
        false_positive = sum(1 for truth, guess in pairs if truth != label and guess == label)
        false_negative = sum(1 for truth, guess in pairs if truth == label and guess != label)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        metrics[label] = {
            "support": float(true_positive + false_negative),
            "predicted": float(true_positive + false_positive),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }
    return metrics


def load_population_counts(pack_dir: Path) -> dict[str, int] | None:
    """Phân bố nhãn dự đoán trên toàn bộ tập đã phân tích, đọc từ tóm tắt của gói.

    Không đọc lại từ cơ sở dữ liệu: script này cố ý chạy được ngoại tuyến. Thiếu tệp tóm tắt
    thì báo "không cân lại được" chứ không đoán bừa.
    """
    summary_path = pack_dir / "pilot-pack-summary.json"
    if not summary_path.exists():
        return None
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    counts = summary.get("candidate_by_label") or summary.get("available_by_label")
    if not counts:
        return None
    return {str(label): int(count) for label, count in counts.items()}


def weighted_confusion(
    truths_by_stratum: dict[str, list[str]],
    population_counts: dict[str, int],
) -> dict[str, dict[str, float]]:
    """Nhân mỗi tầng dự đoán cho đúng tỷ lệ thật của nó, ra ma trận tính theo tập đã phân tích.

    Mỗi câu trong tầng ``D`` đại diện cho ``N_D / n_D`` câu ngoài tập thật, với ``N_D`` là số câu
    mô hình dự đoán ``D`` trên toàn tập và ``n_D`` là số câu của tầng đó có nhãn người chấm.
    Kết quả là ước lượng cho toàn tập, không phải cho mẫu.
    """
    matrix: dict[str, dict[str, float]] = {truth: defaultdict(float) for truth in LABELS}
    for stratum, truths in truths_by_stratum.items():
        population = population_counts.get(stratum, 0)
        if not truths or population == 0:
            continue
        weight = population / len(truths)
        for truth in truths:
            matrix[truth][stratum] += weight
    return matrix


def metrics_from_confusion(
    matrix: dict[str, dict[str, float]],
) -> dict[str, dict[str, float]]:
    metrics: dict[str, dict[str, float]] = {}
    for label in LABELS:
        true_positive = matrix[label][label]
        false_positive = sum(matrix[other][label] for other in LABELS if other != label)
        false_negative = sum(matrix[label][other] for other in LABELS if other != label)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        metrics[label] = {
            "support": round(true_positive + false_negative, 2),
            "predicted": round(true_positive + false_positive, 2),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }
    return metrics


def bootstrap_intervals(
    truths_by_stratum: dict[str, list[str]],
    population_counts: dict[str, int],
    iterations: int = 2000,
    seed: int = 20260920,
) -> dict[str, list[float]]:
    """Khoảng tin cậy 95% cho các chỉ số đã cân lại, bằng bootstrap theo tầng.

    Cần thiết vì trọng số ngoại suy tỷ lệ nhầm lẫn của một tầng chỉ 25 câu lên tận 176 hay 214
    câu. Ví dụ recall của ``Mixed`` lấy 61% số câu thật từ đúng một tầng 25 câu, nên con số điểm
    rất dễ bị tin quá mức. Bootstrap giữ nguyên cỡ mẫu từng tầng và lấy lại mẫu bên trong tầng,
    đúng theo cách mẫu đã được rút ra.
    """
    rng = random.Random(seed)
    accuracies: list[float] = []
    macro_f1s: list[float] = []
    negative_recalls: list[float] = []
    strata = [(stratum, truths, population_counts[stratum]) for stratum, truths in truths_by_stratum.items()
              if truths and population_counts.get(stratum)]
    population_total = sum(population for _, _, population in strata)
    if not strata or population_total == 0:
        return {}

    for _ in range(iterations):
        resampled = {
            stratum: [rng.choice(truths) for _ in truths] for stratum, truths, _ in strata
        }
        weights = {stratum: population for stratum, _, population in strata}
        matrix: dict[str, dict[str, float]] = {truth: defaultdict(float) for truth in LABELS}
        for stratum, truths in resampled.items():
            weight = weights[stratum] / len(truths)
            for truth in truths:
                matrix[truth][stratum] += weight
        metrics = metrics_from_confusion(matrix)
        accuracies.append(sum(matrix[label][label] for label in LABELS) / population_total)
        macro_f1s.append(sum(item["f1"] for item in metrics.values()) / len(metrics))
        negative_recalls.append(metrics["Negative"]["recall"])

    def percentile(values: list[float]) -> list[float]:
        ordered = sorted(values)
        low = ordered[int(0.025 * (len(ordered) - 1))]
        high = ordered[int(0.975 * (len(ordered) - 1))]
        return [round(low, 4), round(high, 4)]

    return {
        "iterations": iterations,
        "seed": seed,
        "accuracy_95": percentile(accuracies),
        "macro_f1_95": percentile(macro_f1s),
        "negative_recall_95": percentile(negative_recalls),
    }


def normalize_label(value: str) -> str:
    label = value.strip()
    if not label:
        return ""
    for known in LABELS + ("Uncertain",):
        if known.lower() == label.lower():
            return known
    raise ValueError(f"Nhãn không hợp lệ: {value!r}. Chỉ nhận {', '.join(LABELS)}, Uncertain.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score the pilot review pack against the model predictions.")
    parser.add_argument("--pack-dir", type=Path, default=DEFAULT_PACK_DIR)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.45,
        help="Ngưỡng độ tin cậy đang cấu hình, dùng cho phần 'chất lượng khi dùng thật'.",
    )
    return parser.parse_args()


def main() -> int:
    force_utf8_output()
    args = parse_args()
    pack_dir = args.pack_dir.resolve()
    annotation_path = pack_dir / "pilot-annotation-sheet.csv"
    prediction_path = pack_dir / "pilot-model-predictions.csv"
    for path in (annotation_path, prediction_path):
        if not path.exists():
            raise FileNotFoundError(f"Thiếu tệp: {path}")

    predictions = {row["SampleId"]: row for row in read_csv(prediction_path)}
    annotations = read_csv(annotation_path)

    pairs: list[tuple[str, str]] = []
    flagged_pairs: list[tuple[str, str]] = []
    confusion: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    truths_by_stratum: dict[str, list[str]] = defaultdict(list)
    unlabeled: list[str] = []
    excluded = 0

    for row in annotations:
        sample_id = row["SampleId"]
        raw_truth = row.get("Sentiment", "")
        prediction = predictions.get(sample_id)
        if prediction is None:
            raise ValueError(f"Nhãn mô hình thiếu cho mẫu {sample_id}")
        truth = normalize_label(raw_truth)
        if not truth:
            unlabeled.append(sample_id)
            continue
        if truth in EXCLUDED_LABELS:
            excluded += 1
            continue
        guess = prediction["PredictedLabel"]
        pairs.append((truth, guess))
        confusion[truth][guess] += 1
        truths_by_stratum[guess].append(truth)
        if float(prediction["Confidence"] or 0) >= args.min_confidence and guess in FLAGGED_LABELS:
            flagged_pairs.append((truth, guess))

    if not pairs:
        raise ValueError("Chưa có dòng nào được chấm. Điền cột Sentiment trong pilot-annotation-sheet.csv.")

    correct = sum(1 for truth, guess in pairs if truth == guess)
    sample_accuracy = correct / len(pairs)
    metrics = per_class_metrics(pairs)
    sample_macro_f1 = sum(item["f1"] for item in metrics.values()) / len(metrics)

    flagged_true = sum(1 for truth, guess in flagged_pairs if truth in FLAGGED_LABELS)
    flagged_precision = flagged_true / len(flagged_pairs) if flagged_pairs else 0.0
    flagged_low, flagged_high = wilson_interval(flagged_true, len(flagged_pairs))

    # Số đọc để ra quyết định: nhân mẫu về đúng phân bố dự đoán của tập đã phân tích.
    population_counts = load_population_counts(pack_dir)
    weighted_metrics: dict[str, dict[str, float]] | None = None
    weighted_accuracy = 0.0
    weighted_macro_f1 = 0.0
    weighted_matrix: dict[str, dict[str, float]] = {truth: defaultdict(float) for truth in LABELS}
    population_total = sum(population_counts.values()) if population_counts else 0
    bootstrap: dict[str, list[float]] = {}
    if population_counts and population_total > 0:
        weighted_matrix = weighted_confusion(truths_by_stratum, population_counts)
        weighted_metrics = metrics_from_confusion(weighted_matrix)
        weighted_correct = sum(weighted_matrix[label][label] for label in LABELS)
        weighted_accuracy = weighted_correct / population_total
        weighted_macro_f1 = sum(item["f1"] for item in weighted_metrics.values()) / len(weighted_metrics)
        bootstrap = bootstrap_intervals(truths_by_stratum, population_counts)

    # Tiêu chí chấp nhận ở mục 0.5 của kế hoạch. Đem ra đo bằng số đã cân lại.
    gate_macro_f1 = 0.80
    gate_negative_recall = 0.80

    report = {
        "evaluated_rows": len(pairs),
        "unlabeled_rows": len(unlabeled),
        "excluded_uncertain_rows": excluded,
        "sample_unweighted": {
            "note": "Mẫu phân tầng 25 câu/nhãn dự đoán; chỉ precision là đọc trực tiếp được.",
            "accuracy": round(sample_accuracy, 4),
            "macro_f1": round(sample_macro_f1, 4),
            "per_class": metrics,
            "confusion_matrix": {truth: dict(row) for truth, row in sorted(confusion.items())},
        },
        "population_weighted": (
            {
                "predicted_distribution": population_counts,
                "population_total": population_total,
                "accuracy": round(weighted_accuracy, 4),
                "macro_f1": round(weighted_macro_f1, 4),
                "bootstrap_95": bootstrap,
                "per_class": weighted_metrics,
                "confusion_matrix": {
                    truth: {guess: round(weighted_matrix[truth][guess], 2) for guess in LABELS}
                    for truth in LABELS
                },
            }
            if weighted_metrics
            else None
        ),
        "acceptance_gates": {
            "macro_f1_threshold": gate_macro_f1,
            "macro_f1_measured": round(weighted_macro_f1, 4) if weighted_metrics else None,
            "macro_f1_passed": bool(weighted_metrics and weighted_macro_f1 >= gate_macro_f1),
            "negative_recall_threshold": gate_negative_recall,
            "negative_recall_measured": (
                weighted_metrics["Negative"]["recall"] if weighted_metrics else None
            ),
            "negative_recall_passed": bool(
                weighted_metrics and weighted_metrics["Negative"]["recall"] >= gate_negative_recall
            ),
        },
        "flagged_subset": {
            "min_confidence": args.min_confidence,
            "flagged_labels": sorted(FLAGGED_LABELS),
            "rows": len(flagged_pairs),
            "true_flagged": flagged_true,
            "precision": round(flagged_precision, 4),
            "precision_wilson_95": [round(flagged_low, 4), round(flagged_high, 4)],
            "note": "Precision có điều kiện theo dự đoán nên đọc trực tiếp được, không cần cân lại.",
        },
    }

    lines = [
        "# Kết quả pilot — phân loại ý kiến mở (chấm mù)",
        "",
        f"- Số câu được chấm: **{len(pairs)}**",
        f"- Bỏ trống chưa chấm: {len(unlabeled)}",
        f"- Câu `Uncertain` bị loại khỏi phép tính: {excluded}",
        "",
        "## 0. Cách đọc bộ số này",
        "",
    ]
    if population_counts:
        lines += [
            "Mẫu lấy **phân tầng 25 câu mỗi nhãn dự đoán**, nên phân bố lớp trong mẫu không phải phân",
            "bố thật. Phân bố dự đoán của tập đã phân tích:",
            "",
            "| Nhãn dự đoán | Trong tập | Trong mẫu | Hệ số |",
            "|---|---:|---:|---:|",
        ]
        for label in LABELS:
            population = population_counts.get(label, 0)
            sampled = len(truths_by_stratum.get(label, []))
            factor = f"{population / sampled:.2f}×" if sampled else "—"
            lines.append(f"| {label} | {population} | {sampled} | {factor} |")
        lines += [
            f"| **Tổng** | **{population_total}** | **{len(pairs)}** | |",
            "",
            "Vì vậy: **precision** ở mục 1 đọc trực tiếp được (precision có điều kiện theo dự đoán,",
            "và mỗi tầng đều được lấy ngẫu nhiên đủ câu). **Recall, F1 và accuracy** phải đọc ở mục 3,",
            "đã nhân lại về đúng phân bố thật. Đọc thẳng số của mẫu cho ba chỉ số đó là lặp lại đúng",
            "lỗi đã làm con số tập trộn của Giai đoạn 1 bị thổi lên.",
        ]
    else:
        lines += [
            "**:warning: Không tìm thấy `pilot-pack-summary.json`** nên không cân lại được trọng số.",
            "Mọi con số dưới đây tính trên mẫu, tức trên một phân bố lớp nhân tạo — không dùng để",
            "ra quyết định nghiệm thu.",
        ]

    lines += [
        "",
        "## 1. Precision từng lớp (đọc trực tiếp được)",
        "",
        "| Lớp | Số câu mô hình gắn trong mẫu | Đúng | Precision | Wilson 95% |",
        "|---|---:|---:|---:|---:|",
    ]
    for label in LABELS:
        item = metrics[label]
        predicted = int(item["predicted"])
        hits = sum(1 for truth, guess in pairs if guess == label and truth == label)
        low, high = wilson_interval(hits, predicted)
        lines.append(
            f"| {label} | {predicted} | {hits} | {item['precision']:.4f} | {low:.4f}–{high:.4f} |"
        )

    lines += [
        "",
        "## 2. Ma trận nhầm lẫn (dòng = nhãn chuyên viên, cột = nhãn mô hình)",
        "",
        "Đếm thô trong mẫu:",
        "",
        "| Thực tế \\ Mô hình | " + " | ".join(LABELS) + " |",
        "|---|" + "---:|" * len(LABELS),
    ]
    for truth in LABELS:
        cells = " | ".join(str(confusion[truth].get(guess, 0)) for guess in LABELS)
        lines.append(f"| {truth} | {cells} |")

    if weighted_metrics:
        lines += [
            "",
            "Đã nhân trọng số về tập đã phân tích (đơn vị: câu):",
            "",
            "| Thực tế \\ Mô hình | " + " | ".join(LABELS) + " |",
            "|---|" + "---:|" * len(LABELS),
        ]
        for truth in LABELS:
            cells = " | ".join(f"{weighted_matrix[truth][guess]:.0f}" for guess in LABELS)
            lines.append(f"| {truth} | {cells} |")

    lines += [
        "",
        "## 3. Accuracy, recall, F1 sau khi cân lại trọng số",
        "",
    ]
    if weighted_metrics:
        lines += [
            f"- Accuracy: **{weighted_accuracy:.4f}** (số chưa cân lại của mẫu: {sample_accuracy:.4f})",
            f"- Macro F1: **{weighted_macro_f1:.4f}** (số chưa cân lại của mẫu: {sample_macro_f1:.4f})",
            "",
            "| Lớp | Số câu thật (ước lượng) | Precision | Recall | F1 |",
            "|---|---:|---:|---:|---:|",
        ]
        for label in LABELS:
            item = weighted_metrics[label]
            lines.append(
                f"| {label} | {item['support']:.0f} | {item['precision']:.4f} | "
                f"{item['recall']:.4f} | {item['f1']:.4f} |"
            )
        if bootstrap:
            lines += [
                "",
                f"Khoảng tin cậy 95% (bootstrap theo tầng, {bootstrap['iterations']} lần):",
                "",
                f"- Accuracy: {bootstrap['accuracy_95'][0]:.4f}–{bootstrap['accuracy_95'][1]:.4f}",
                f"- Macro F1: {bootstrap['macro_f1_95'][0]:.4f}–{bootstrap['macro_f1_95'][1]:.4f}",
                f"- Recall `Negative`: {bootstrap['negative_recall_95'][0]:.4f}–"
                f"{bootstrap['negative_recall_95'][1]:.4f}",
                "",
                "Khoảng này rộng vì trọng số ngoại suy tỷ lệ nhầm lẫn của một tầng chỉ 25 câu lên tận",
                "176 hay 214 câu. Recall của `Mixed` lấy phần lớn số câu thật từ đúng một tầng, nên",
                "điểm ước lượng của nó là con số yếu nhất trong bảng — đừng đọc chính xác tới hai chữ số.",
            ]
    else:
        lines += [
            "Không cân lại được (thiếu tóm tắt gói). Số của mẫu, không dùng để nghiệm thu:",
            "",
            f"- Accuracy: {sample_accuracy:.4f}",
            f"- Macro F1: {sample_macro_f1:.4f}",
        ]

    lines += [
        "",
        "## 4. Đối chiếu tiêu chí chấp nhận (mục 0.5)",
        "",
        "| Tiêu chí | Ngưỡng | Đo được | Kết luận |",
        "|---|---:|---:|---|",
    ]
    if weighted_metrics:
        macro_ok = weighted_macro_f1 >= gate_macro_f1
        negative_recall = weighted_metrics["Negative"]["recall"]
        recall_ok = negative_recall >= gate_negative_recall
        lines += [
            f"| Macro F1 | ≥ {gate_macro_f1:.2f} | {weighted_macro_f1:.4f} | "
            f"{'ĐẠT' if macro_ok else '**KHÔNG ĐẠT**'} |",
            f"| Recall `Negative` | ≥ {gate_negative_recall:.2f} | {negative_recall:.4f} | "
            f"{'ĐẠT' if recall_ok else '**KHÔNG ĐẠT**'} |",
            "",
            (
                "Kết luận: **chưa đạt tiêu chí chấp nhận**, không được bật mặc định."
                if not (macro_ok and recall_ok)
                else "Kết luận: đạt tiêu chí chấp nhận."
            ),
        ]
    else:
        lines.append("| — | — | — | Không kết luận được vì chưa cân lại trọng số |")

    lines += [
        "",
        "## 5. Chất lượng khi dùng thật",
        "",
        f"Tập bị gắn cờ: dự đoán thuộc {sorted(FLAGGED_LABELS)} và độ tin cậy ≥ {args.min_confidence}.",
        "",
        f"- Số câu bị gắn cờ trong mẫu: **{len(flagged_pairs)}**",
        f"- Trong đó đúng: {flagged_true}",
        f"- Precision của tập bị gắn cờ: **{flagged_precision:.4f}** "
        f"(Wilson 95%: {flagged_low:.4f}–{flagged_high:.4f})",
        "",
        "Precision này đọc trực tiếp được, không cần cân lại: nó trả lời đúng câu hỏi \"trong số ý kiến",
        "bị gắn cờ, bao nhiêu phần trăm thật sự là âm\". Nhưng nó **không** cho biết mô hình bỏ sót bao",
        "nhiêu câu âm — xem recall của `Negative` và `Mixed` ở mục 3.",
        "",
    ]

    report_dir = args.report_dir.resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "pilot-evaluation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (report_dir / "pilot-evaluation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    print(f"Đã ghi: {report_dir / 'pilot-evaluation.json'} và pilot-evaluation.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
