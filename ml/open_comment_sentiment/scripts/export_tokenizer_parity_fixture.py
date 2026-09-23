"""Export a synthetic tokenizer parity fixture so the C# port can be verified against Python.

The fixture only contains hand-written synthetic Vietnamese sentences (same rule as the
regression fixture): no student comment text ever leaves the local database for Git.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output
from sentiment_baseline.phobert_model import load_phobert_tokenizer

REGRESSION_FIXTURE = PROJECT_ROOT / "data" / "fixtures" / "regression-comments.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "fixtures" / "tokenizer-parity.json"

WARNING = (
    "Fixture tổng hợp do nhóm kỹ thuật viết tay, chỉ dùng để kiểm tra bản port tokenizer C# "
    "có tạo ra input_ids giống tokenizer Python hay không. Không chứa nội dung phản hồi của sinh viên "
    "và không phải metric chất lượng mô hình."
)

# Edge cases that the regression fixture does not cover but the backend will meet.
EXTRA_CASES: list[tuple[str, str]] = [
    ("EXTRA-001", "   "),
    ("EXTRA-002", "a"),
    ("EXTRA-003", "A"),
    ("EXTRA-004", "Em cảm ơn thầy cô ạ."),
    ("EXTRA-005", "Thầy dạy hay\tvà vui vẻ"),
    ("EXTRA-006", "Dòng một\nDòng hai"),
    ("EXTRA-007", "Giảng viên KHÔNG giải đáp thắc mắc."),
    ("EXTRA-008", "Cần thêm bài tập!!! Nhưng đừng quá nhiều..."),
    ("EXTRA-009", "abcXYZ123"),
    ("EXTRA-010", "Nhóm học tập làm việc hiệu quả, tuy nhiên khối lượng hơi nặng;"),
    ("EXTRA-011", "Em không có ý kiến gì thêm, cảm ơn!"),
    ("EXTRA-012", "Tài liệu @@ đặc biệt </s> <unk> <mask>"),
    ("EXTRA-013", "Điểm 9.5/10 nhưng đề thi quá khó???"),
    ("EXTRA-014", "Thầy cô nhiệt tình, giải đáp nhanh, lịch học hợp lý."),
]

# One long synthetic sentence to exercise truncation at the configured max length.
LONG_TEXT = " ".join(
    ["Sinh viên ghi nhận giảng viên hướng dẫn tận tình và giải đáp thắc mắc đầy đủ."] * 40
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export tokenizer parity fixture for the C# port")
    parser.add_argument("--model-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "phobert_checkpoint")
    parser.add_argument("--regression-fixture", type=Path, default=REGRESSION_FIXTURE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def collect_cases(regression_fixture: Path) -> list[tuple[str, str]]:
    cases: list[tuple[str, str]] = []
    if regression_fixture.is_file():
        with regression_fixture.open("r", encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                cases.append((row["CaseId"], row["Text"]))
    else:
        print(f"[warn] Missing regression fixture: {regression_fixture}", file=sys.stderr)

    cases.extend(EXTRA_CASES)
    cases.append(("EXTRA-LONG", LONG_TEXT))
    return cases


def main() -> int:
    force_utf8_output()
    args = parse_args()
    max_length = args.max_length

    tokenizer = load_phobert_tokenizer(str(args.model_dir))
    cases = collect_cases(args.regression_fixture)

    encoded_cases: list[dict[str, object]] = []
    for case_id, text in cases:
        encoding = tokenizer(text, truncation=True, max_length=max_length)
        encoded_cases.append(
            {
                "case_id": case_id,
                "text": text,
                "tokens": tokenizer.tokenize(text)[: max_length - 2],
                "input_ids": list(encoding["input_ids"]),
                "attention_mask": list(encoding["attention_mask"]),
            }
        )

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": WARNING,
        "is_synthetic": True,
        "tokenizer_class": type(tokenizer).__name__,
        "max_length": max_length,
        "special_token_ids": {"bos": 0, "pad": 1, "eos": 2, "unk": 3},
        "case_count": len(encoded_cases),
        "cases": encoded_cases,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    truncated = sum(1 for case in encoded_cases if len(case["input_ids"]) >= max_length)
    print(f"[OK] Đã ghi {len(encoded_cases)} ca vào {args.output}")
    print(f"     Số ca bị cắt ở max_length={max_length}: {truncated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
