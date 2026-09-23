from __future__ import annotations

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import sys
import unicodedata

from sklearn.metrics import cohen_kappa_score


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402

DEFAULT_REVIEW_DIR = PROJECT_ROOT / "data" / "processed" / "review"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "processed" / "local-gold.csv"
KAPPA_TARGET = 0.75

LABELS = ("Positive", "Negative", "Neutral", "Mixed", "Uncertain")

# Forgiving aliases so a reviewer typing the Vietnamese label in the UI wording
# still produces a valid sheet. Everything is normalised back to the five codes.
LABEL_ALIASES = {
    "positive": "Positive",
    "tich cuc": "Positive",
    "negative": "Negative",
    "tieu cuc": "Negative",
    "neutral": "Neutral",
    "trung tinh": "Neutral",
    "mixed": "Mixed",
    "hon hop": "Mixed",
    "uncertain": "Uncertain",
    "chua chac chan": "Uncertain",
}


def fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.replace("đ", "d").replace("Đ", "D").casefold().split())


def canonical_label(value: str) -> str | None:
    stripped = " ".join((value or "").strip().split())
    if not stripped:
        return None
    if stripped in LABELS:
        return stripped
    return LABEL_ALIASES.get(fold(stripped))


def read_sheet(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing annotation sheet: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"SampleId", "Text", "Sentiment"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name} is missing columns: {sorted(missing)}")
        return list(reader)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge the two annotation sheets, measure agreement and prepare adjudication/gold files."
    )
    parser.add_argument("--review-dir", type=Path, default=DEFAULT_REVIEW_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--adjudication",
        type=Path,
        help="Filled adjudication CSV. When given, writes the final local gold file.",
    )
    parser.add_argument(
        "--reset-adjudication",
        action="store_true",
        help=(
            "Regenerate the adjudication template. Without this flag an existing file is kept, "
            "because it may already contain the adjudicator's decisions."
        ),
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Report progress without failing when some rows are still unlabelled.",
    )
    return parser.parse_args()


def collect(path: Path) -> tuple[dict[str, dict[str, str]], dict[str, str], int]:
    rows = read_sheet(path)
    labels: dict[str, str] = {}
    invalid: dict[str, str] = {}
    normalized = 0
    for row in rows:
        raw = row.get("Sentiment", "")
        sample_id = row["SampleId"]
        if not (raw or "").strip():
            continue
        label = canonical_label(raw)
        if label is None:
            invalid[sample_id] = raw.strip()
            continue
        if label != raw.strip():
            normalized += 1
        labels[sample_id] = label
    return {row["SampleId"]: row for row in rows}, labels, normalized


def main() -> int:
    force_utf8_output()
    args = parse_args()
    review_dir = args.review_dir.resolve()
    sheet_a = review_dir / "annotator-a.csv"
    sheet_b = review_dir / "annotator-b.csv"

    rows_a, labels_a, normalized_a = collect(sheet_a)
    rows_b, labels_b, normalized_b = collect(sheet_b)

    if set(rows_a) != set(rows_b):
        only_a = sorted(set(rows_a) - set(rows_b))[:10]
        only_b = sorted(set(rows_b) - set(rows_a))[:10]
        print(f"SampleId sets differ. Only in A: {only_a}. Only in B: {only_b}", file=sys.stderr)
        return 1

    total = len(rows_a)
    print(f"Tổng số câu: {total}")
    print(
        f"Đã gán: A {len(labels_a)}/{total} ({len(labels_a) / total:.0%}), "
        f"B {len(labels_b)}/{total} ({len(labels_b) / total:.0%})"
    )
    if normalized_a or normalized_b:
        print(f"Nhãn được tự chuẩn hoá về mã chuẩn: A {normalized_a}, B {normalized_b}")

    problems: list[str] = []
    for annotator, path, row_map in (("A", sheet_a, rows_a), ("B", sheet_b, rows_b)):
        for sample_id, row in row_map.items():
            raw = (row.get("Sentiment") or "").strip()
            if raw and canonical_label(raw) is None:
                problems.append(f"{annotator}:{sample_id} nhãn không hợp lệ {raw!r} (file {path.name})")
    if problems:
        print("Nhãn không hợp lệ:", file=sys.stderr)
        for problem in problems[:20]:
            print(f"  {problem}", file=sys.stderr)
        return 1

    incomplete = [sample_id for sample_id in rows_a if sample_id not in labels_a or sample_id not in labels_b]
    if incomplete and not args.allow_partial:
        print(
            f"\nCòn {len(incomplete)} câu chưa gán đủ ở cả hai phiếu; ví dụ: {sorted(incomplete)[:10]}.\n"
            "Gán xong hết rồi chạy lại, hoặc dùng --allow-partial nếu chỉ muốn xem tiến độ.",
            file=sys.stderr,
        )
        return 3

    compared = sorted(set(labels_a) & set(labels_b))
    if not compared:
        print("Chưa có câu nào được cả hai người gán.", file=sys.stderr)
        return 3

    ordered_a = [labels_a[sample_id] for sample_id in compared]
    ordered_b = [labels_b[sample_id] for sample_id in compared]
    agreements = [left == right for left, right in zip(ordered_a, ordered_b, strict=True)]
    raw_agreement = sum(agreements) / len(compared)
    kappa = cohen_kappa_score(ordered_a, ordered_b, labels=list(LABELS))

    disagreements = [sample_id for sample_id, agreed in zip(compared, agreements, strict=True) if not agreed]
    confusion = Counter(
        (labels_a[sample_id], labels_b[sample_id]) for sample_id in compared if labels_a[sample_id] != labels_b[sample_id]
    )

    adjudication_path = review_dir / "adjudication.csv"
    if adjudication_path.exists() and not args.reset_adjudication:
        print(
            f"\nGiữ nguyên file phân xử hiện có: {adjudication_path} "
            "(dùng --reset-adjudication nếu muốn tạo lại từ đầu)"
        )
    else:
        with adjudication_path.open("w", encoding="utf-8-sig", newline="") as stream:
            fields = ["SampleId", "Text", "AnnotatorA", "AnnotatorB", "Sentiment", "NeedsAdjudication", "AdjudicatorNotes"]
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for sample_id in disagreements:
                row = rows_a[sample_id]
                writer.writerow(
                    {
                        "SampleId": sample_id,
                        "Text": row["Text"],
                        "AnnotatorA": labels_a[sample_id],
                        "AnnotatorB": labels_b[sample_id],
                        "Sentiment": "",
                        "NeedsAdjudication": "Y",
                        "AdjudicatorNotes": "",
                    }
                )

    summary = {
        "rows": total,
        "labelled_a": len(labels_a),
        "labelled_b": len(labels_b),
        "compared_rows": len(compared),
        "raw_agreement": raw_agreement,
        "cohen_kappa": kappa,
        "kappa_target": KAPPA_TARGET,
        "kappa_meets_target": kappa >= KAPPA_TARGET,
        "disagreement_rows": len(disagreements),
        "disagreement_pairs": {f"{left}->{right}": count for (left, right), count in sorted(confusion.items())},
        "label_distribution_a": dict(sorted(Counter(ordered_a).items())),
        "label_distribution_b": dict(sorted(Counter(ordered_b).items())),
        "adjudication_file": adjudication_path.name,
    }
    (review_dir / "agreement-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if not summary["kappa_meets_target"]:
        print(
            f"\nCohen's Kappa = {kappa:.4f} < {KAPPA_TARGET}. "
            "Phải sửa hướng dẫn gán nhãn và gán lại các câu bất đồng, không được hạ chuẩn.",
            file=sys.stderr,
        )

    if not args.adjudication:
        print(f"\nFile phân xử đã tạo: {adjudication_path}")
        print("Người thứ ba điền cột Sentiment rồi chạy lại với --adjudication <duong-dan>.")
        return 0

    adjudication_file = args.adjudication.resolve()
    with adjudication_file.open("r", encoding="utf-8-sig", newline="") as stream:
        adjudicated = list(csv.DictReader(stream))
    resolutions: dict[str, str] = {}
    for row in adjudicated:
        raw = (row.get("Sentiment") or "").strip()
        if not raw:
            continue
        label = canonical_label(raw)
        if label is None:
            print(f"Nhãn phân xử không hợp lệ ở {row.get('SampleId')}: {raw!r}", file=sys.stderr)
            return 1
        resolutions[row["SampleId"]] = label

    unresolved = [sample_id for sample_id in disagreements if sample_id not in resolutions]
    if unresolved:
        print(
            f"Còn {len(unresolved)} câu bất đồng chưa được phân xử; ví dụ: {unresolved[:10]}.",
            file=sys.stderr,
        )
        return 3

    split_path = review_dir / "split-assignment.csv"
    splits: dict[str, str] = {}
    if split_path.is_file():
        with split_path.open("r", encoding="utf-8-sig", newline="") as stream:
            splits = {row["SampleId"]: row["Split"] for row in csv.DictReader(stream)}

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = ["SampleId", "Text", "SourceGroup", "Sentiment", "Split", "NeedsAdjudication", "LabelSource"]
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for sample_id in sorted(rows_a):
            row = rows_a[sample_id]
            if sample_id in resolutions:
                label, source = resolutions[sample_id], "adjudication"
            elif labels_a[sample_id] == labels_b[sample_id]:
                label, source = labels_a[sample_id], "agreement"
            else:
                print(f"Thiếu nhãn cho {sample_id}", file=sys.stderr)
                return 1
            writer.writerow(
                {
                    "SampleId": sample_id,
                    "Text": row["Text"],
                    "SourceGroup": row.get("SourceGroup", ""),
                    "Sentiment": label,
                    "Split": splits.get(sample_id, ""),
                    "NeedsAdjudication": row.get("NeedsAdjudication", ""),
                    "LabelSource": source,
                }
            )

    distribution = dict(sorted(Counter(
        (resolutions[sample_id] if sample_id in resolutions else labels_a[sample_id]) for sample_id in rows_a
    ).items()))
    print(f"\nGold file: {output}")
    print(f"  Nhãn lấy từ đồng thuận: {len(rows_a) - len(disagreements)}")
    print(f"  Nhãn do phân xử: {len(disagreements)}")
    print(f"  Phân bố nhãn: {distribution}")
    print(f"  Số câu có Split: {sum(1 for value in splits.values() if value)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
