"""Dựng gói pilot để chuyên viên nghiệp vụ chấm tay cho mô hình đã phát hành.

Giai đoạn 5 của kế hoạch chạy ở chế độ bóng (shadow): mô hình đã ghi nhãn vào
``OpenCommentAnalysisResults`` nhưng chưa ai dùng nhãn đó để ra quyết định. Muốn biết
nhãn đó có dùng được không thì phải có người chấm độc lập rồi đối chiếu.

Nguyên tắc của gói này:

1. **Chấm mù.** Phiếu chấm KHÔNG chứa nhãn của mô hình. Nếu chuyên viên nhìn thấy
   nhãn trước thì họ bị neo theo, và con số đo được chỉ là mức đồng thuận giả.
   Nhãn của mô hình nằm ở ``pilot-model-predictions.csv``, khoá theo ``SampleId``.
2. **Lấy mẫu phân tầng theo nhãn mô hình đã đoán.** Lấy ngẫu nhiên thuần thì lớp
   ``Negative``/``Mixed`` — đúng những lớp cần biết nhất — chỉ chiếm vài dòng.
3. **Khử định danh.** Che email/URL/số điện thoại, gộp khoảng trắng, bỏ trùng.
4. **Không ghi ra Git.** Gói nằm trong ``data/processed/`` — thư mục đã bị gitignore,
   vì văn bản gốc là ý kiến của sinh viên về giảng viên.

Việc chấm xong trả về ``pilot-annotated.csv``, rồi chạy
``evaluate_pilot_pack.py`` để ra precision/recall/F1 từng lớp.
"""

from __future__ import annotations

import argparse
from collections import Counter, OrderedDict
import csv
import io
import json
from pathlib import Path
import random
import re
import subprocess
import unicodedata


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "pilot"

# Nhãn chuyên viên được phép dùng. Giống bộ nhãn của tập gold trước đó, thêm
# ``Uncertain`` cho câu không đủ ngữ cảnh để chốt; câu ``Uncertain`` bị loại khỏi
# phần tính điểm chứ không tính là đoán sai.
ANNOTATION_LABELS = ("Negative", "Neutral", "Positive", "Mixed", "Uncertain")

# Mỗi lớp lấy tối đa bao nhiêu dòng. Trần này giữ cho phiếu chấm còn làm nổi trong
# một buổi; lớp nào ít hơn trần thì lấy hết.
DEFAULT_QUOTA_PER_LABEL = 25

FIELDS = [
    "SurveyResponseId",
    "Sentiment",
    "Confidence",
    "ModelVersion",
    "ManualSentiment",
    "CommentText",
]

SQL = r"""
COPY (
    SELECT r."ResponseId" AS "SurveyResponseId",
           a."Sentiment" AS "Sentiment",
           a."Confidence" AS "Confidence",
           a."ModelVersion" AS "ModelVersion",
           COALESCE(a."ManualSentiment", '') AS "ManualSentiment",
           btrim(r."AdditionalComments") AS "CommentText"
    FROM "OpenCommentAnalysisResults" a
    JOIN "SurveyResponses" r ON r."ResponseId" = a."SurveyResponseId"
    WHERE NOT r."IsDeleted"
      AND r."AdditionalComments" IS NOT NULL
      AND btrim(r."AdditionalComments") <> ''
      AND a."Sentiment" IS NOT NULL
    ORDER BY a."SurveyResponseId"
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE);
"""

EMAIL_PATTERN = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
URL_PATTERN = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.()-]*\d){8,10}(?!\d)")


def normalize_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).strip().split())


def mask_direct_identifiers(value: str) -> str:
    value = EMAIL_PATTERN.sub("[EMAIL]", value)
    value = URL_PATTERN.sub("[URL]", value)
    return PHONE_PATTERN.sub("[PHONE]", value)


def length_bucket(text: str) -> str:
    length = len(text.split())
    if length <= 5:
        return "short"
    if length <= 20:
        return "medium"
    return "long"


def docker_env(container: str, key: str) -> str:
    result = subprocess.run(
        ["docker", "exec", container, "printenv", key],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"Container {container!r} does not expose {key}")
    return value


def load_analyzed_rows(container: str) -> list[dict[str, str]]:
    user = docker_env(container, "POSTGRES_USER")
    database = docker_env(container, "POSTGRES_DB")
    command = [
        "docker",
        "exec",
        "-i",
        "-e",
        "PGOPTIONS=-c default_transaction_read_only=on",
        container,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-qAt",
        "-U",
        user,
        "-d",
        database,
    ]
    result = subprocess.run(
        command,
        input=SQL,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    rows = list(csv.DictReader(io.StringIO(result.stdout)))
    if rows and set(rows[0]) != set(FIELDS):
        raise RuntimeError(f"Unexpected export columns: {set(rows[0])}")
    return rows


def stratify(rows: list[dict[str, str]], quota: int, seed: int) -> list[dict[str, str]]:
    """Lấy đều mỗi lớp dự đoán một trần như nhau, thay vì lấy theo tỷ lệ thật."""
    rng = random.Random(seed)
    by_label: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        by_label.setdefault(row["PredictedLabel"], []).append(row)

    picked: list[dict[str, str]] = []
    for label in sorted(by_label):
        candidates = sorted(by_label[label], key=lambda row: int(row["SurveyResponseId"]))
        rng.shuffle(candidates)
        picked.extend(candidates[:quota])

    # Trộn lần cuối để thứ tự trong phiếu không lộ nhãn theo cụm.
    rng.shuffle(picked)
    return picked


def write_annotation_sheet(path: Path, sample: list[dict[str, str]]) -> None:
    fields = ["SampleId", "Text", "LengthBucket", "Sentiment", "Notes"]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in sample:
            writer.writerow(
                {
                    "SampleId": row["SampleId"],
                    "Text": row["Text"],
                    "LengthBucket": row["LengthBucket"],
                    "Sentiment": "",
                    "Notes": "",
                }
            )


def write_predictions(path: Path, sample: list[dict[str, str]]) -> None:
    fields = ["SampleId", "PredictedLabel", "Confidence", "ModelVersion"]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in sample:
            writer.writerow(
                {
                    "SampleId": row["SampleId"],
                    "PredictedLabel": row["PredictedLabel"],
                    "Confidence": row["Confidence"],
                    "ModelVersion": row["ModelVersion"],
                }
            )


def write_sample_map(path: Path, sample: list[dict[str, str]]) -> None:
    fields = ["SampleId", "SurveyResponseId", "LengthBucket", "AlreadyReviewed"]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in sample:
            writer.writerow(
                {
                    "SampleId": row["SampleId"],
                    "SurveyResponseId": row["SurveyResponseId"],
                    "LengthBucket": row["LengthBucket"],
                    "AlreadyReviewed": "yes" if row["AlreadyReviewed"] else "no",
                }
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a blinded pilot review pack from analysed open comments."
    )
    parser.add_argument("--container", default="khaosatvmu_db")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--quota-per-label",
        type=int,
        default=DEFAULT_QUOTA_PER_LABEL,
        help="Most rows to take from each predicted label.",
    )
    parser.add_argument("--seed", type=int, default=20261001)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    expected_outputs = [
        output_dir / "pilot-annotation-sheet.csv",
        output_dir / "pilot-model-predictions.csv",
        output_dir / "pilot-sample-map.csv",
        output_dir / "pilot-pack-summary.json",
    ]
    if not args.overwrite and any(path.exists() for path in expected_outputs):
        raise FileExistsError("Pilot pack already exists. Use --overwrite explicitly to replace it.")

    rows = load_analyzed_rows(args.container)
    if not rows:
        raise ValueError(
            "No analysed comments found. Run the SentimentWorker first "
            "(docker compose --profile sentiment run --rm sentiment-worker)."
        )

    available = Counter(row["Sentiment"] for row in rows)

    # Khử định danh + bỏ trùng trước khi lấy mẫu, để một câu bị lặp không chiếm
    # nhiều suất trong phiếu.
    seen: set[str] = set()
    candidates: list[dict[str, str]] = []
    for row in rows:
        text = normalize_text(mask_direct_identifiers(row["CommentText"]))
        if not text or text in seen:
            continue
        seen.add(text)
        candidates.append(
            {
                "SurveyResponseId": row["SurveyResponseId"],
                "PredictedLabel": row["Sentiment"],
                "Confidence": row["Confidence"],
                "ModelVersion": row["ModelVersion"],
                "Text": text,
                "LengthBucket": length_bucket(text),
                "AlreadyReviewed": bool(row["ManualSentiment"].strip()),
            }
        )

    sample = stratify(candidates, args.quota_per_label, args.seed)
    for index, row in enumerate(sample, start=1):
        row["SampleId"] = f"P{index:04d}"

    output_dir.mkdir(parents=True, exist_ok=True)
    write_annotation_sheet(expected_outputs[0], sample)
    write_predictions(expected_outputs[1], sample)
    write_sample_map(expected_outputs[2], sample)

    sampled_by_label = Counter(row["PredictedLabel"] for row in sample)
    # Phân bố của ĐÚNG tập đã lấy mẫu (sau khử trùng lặp). Đây mới là trọng số đúng để
    # evaluate_pilot_pack.py cân mẫu về phân bố thật; `available_by_label` tính trên cả
    # những câu bị loại khi khử trùng lặp nên chỉ là xấp xỉ.
    candidate_by_label = Counter(row["PredictedLabel"] for row in candidates)
    summary = OrderedDict(
        [
            ("model_versions", sorted({row["ModelVersion"] for row in sample})),
            ("seed", args.seed),
            ("quota_per_label", args.quota_per_label),
            ("total_analyzed_rows", len(rows)),
            ("unique_candidate_rows", len(candidates)),
            ("available_by_label", dict(sorted(available.items()))),
            ("candidate_by_label", dict(sorted(candidate_by_label.items()))),
            ("sampled_by_label", dict(sorted(sampled_by_label.items()))),
            ("sampled_total", len(sample)),
            ("annotation_labels", list(ANNOTATION_LABELS)),
            (
                "notes",
                [
                    "Phiếu chấm đã khử định danh và KHÔNG chứa nhãn của mô hình.",
                    "Sau khi chấm xong, chạy evaluate_pilot_pack.py để tính precision/recall/F1.",
                    "Gói này nằm trong thư mục bị gitignore; không đưa văn bản gốc ra khỏi máy.",
                    "Mẫu phân tầng nên phân bố lớp trong mẫu không phải phân bố thật; "
                    "candidate_by_label dùng để cân lại trọng số khi chấm điểm.",
                ],
            ),
        ]
    )
    expected_outputs[3].write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Analysed rows in DB: {len(rows)}; unique after de-identification: {len(candidates)}")
    print(f"Available by label: {dict(sorted(available.items()))}")
    print(f"Pilot sample by label: {dict(sorted(sampled_by_label.items()))} (total {len(sample)})")
    print(f"Annotation sheet : {expected_outputs[0]}")
    print(f"Model predictions: {expected_outputs[1]}  <- keep away from the annotator")
    print(f"Sample map       : {expected_outputs[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
