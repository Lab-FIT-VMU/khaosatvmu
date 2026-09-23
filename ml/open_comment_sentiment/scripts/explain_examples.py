#!/usr/bin/env python3
"""Chạy thử vài câu qua đúng model + đúng quy tắc đang dùng trong sản phẩm, để giải thích nguyên lý.

Mục đích là để **trình bày cho người khác xem**: với mỗi câu, in ra ba con số của model, các mệnh đề
đã cắt, và nhãn cuối cùng kèm lý do. Dùng đúng tệp ONNX và đúng ngưỡng của bản chạy thật, nên số in
ra ở đây là số thật, không phải ví dụ minh hoạ.

    .\\.venv\\Scripts\\python.exe scripts/explain_examples.py
    .\\.venv\\Scripts\\python.exe scripts/explain_examples.py --text "Cô dạy hay nhưng chấm điểm khó"

Tài liệu dùng cho người trình bày: `docs/giai-thich-phan-loai-cam-xuc.md`.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

import onnxruntime as ort  # noqa: E402

from sentiment_baseline.console import force_utf8_output  # noqa: E402
from sentiment_baseline.inference_engine import (  # noqa: E402
    SentimentInferenceEngine,
    contains_contrast_marker,
    make_onnx_predict_fn,
    split_clauses,
)
from sentiment_baseline.phobert_model import load_phobert_tokenizer  # noqa: E402

# Đúng ngưỡng đang chạy trong sản phẩm (xem OpenCommentSentimentOptions).
CONFIDENCE_THRESHOLD = 0.45
MIXED_CLAUSE_MIN_CONFIDENCE = 0.20

VI_LABEL = {
    "Negative": "Tiêu cực",
    "Neutral": "Trung tính",
    "Positive": "Tích cực",
    "Mixed": "Hỗn hợp",
    "Uncertain": "Chưa chắc chắn",
}

# Bộ ví dụ mặc định: đúng những câu được dùng trong tài liệu giải thích, mỗi câu minh hoạ một tình
# huống khác nhau. Đổi bộ này thì phải sửa cả tài liệu, nếu không hai bên sẽ nói khác nhau.
DEFAULT_TEXTS = [
    "Thầy giảng dễ hiểu.",
    "Giảng viên dạy không hay",
    "Nên đăng tài liệu sớm hơn",
    "Cô nhiệt tình nhưng bài tập giao quá nhiều.",
    "Phòng thực hành máy tính có nhiều máy lỗi phần mềm, mạng internet chập chờn lúc tức.",
    "Ổn",
    "Dạy hay lắm, hay đến mức em phải tự học lại hết.",
    "adadadad",
]


def describe(engine: SentimentInferenceEngine, predict_proba, text: str) -> None:
    print("=" * 78)
    print(f"CÂU: {text}")

    base = predict_proba([text])[0]
    print(
        f"  Hỏi cả câu  -> Tích cực {base[2] * 100:5.1f}%   "
        f"Trung tính {base[1] * 100:5.1f}%   Tiêu cực {base[0] * 100:5.1f}%"
    )

    clauses = split_clauses(text)
    contrast = contains_contrast_marker(text)
    needs_clause_pass = len(clauses) >= 2 or contrast

    if needs_clause_pass:
        print(f"  Cắt mệnh đề (dấu hiệu hai chiều: {'có' if contrast else 'không'}):")
        clause_probs = predict_proba(clauses)
        for clause, probs in zip(clauses, clause_probs):
            note = ""
            if probs[2] >= MIXED_CLAUSE_MIN_CONFIDENCE:
                note = "  <- tính là vế tích cực"
            elif probs[0] >= MIXED_CLAUSE_MIN_CONFIDENCE:
                note = "  <- tính là vế tiêu cực"
            print(
                f"    · {clause!r:52} TC {probs[2] * 100:5.1f}%  TT {probs[1] * 100:5.1f}%"
                f"  TCu {probs[0] * 100:5.1f}%{note}"
            )
    else:
        print("  Không cần cắt mệnh đề (một vế, không có dấu hiệu hai chiều).")

    result = engine.predict_batch([text])[0]
    reason = []
    if result.is_mixed:
        reason.append("có cả vế tích cực và vế tiêu cực")
    elif result.is_uncertain:
        reason.append(f"cả ba con số đều dưới {CONFIDENCE_THRESHOLD * 100:.0f}%")
    else:
        reason.append("một con số vượt ngưỡng rõ ràng")

    print(
        f"  KẾT LUẬN   -> {VI_LABEL[result.predicted_label]} "
        f"(độ tin {result.confidence * 100:.1f}%)  [{'; '.join(reason)}]"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checkpoint", type=Path, default=PROJECT_ROOT / "artifacts" / "phobert_checkpoint")
    parser.add_argument("--onnx", type=Path, default=PROJECT_ROOT / "artifacts" / "phobert-sentiment.onnx")
    parser.add_argument("--text", action="append", default=[], help="Câu cần thử; truyền nhiều lần để thử nhiều câu")
    return parser.parse_args()


def main() -> int:
    force_utf8_output()
    args = parse_args()

    if not args.onnx.is_file():
        print(f"Thiếu tệp model ONNX tại {args.onnx}. Chạy scripts/export_onnx.py trước.")
        return 2

    tokenizer = load_phobert_tokenizer(str(args.checkpoint))
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    predict_proba = make_onnx_predict_fn(session, tokenizer, batch_size=8, max_length=256)
    engine = SentimentInferenceEngine(
        predict_proba,
        confidence_threshold=CONFIDENCE_THRESHOLD,
        mixed_clause_min_confidence=MIXED_CLAUSE_MIN_CONFIDENCE,
    )

    texts = args.text or DEFAULT_TEXTS
    print(f"Model: {args.onnx.name}   Ngưỡng: độ tin {CONFIDENCE_THRESHOLD}, mệnh đề {MIXED_CLAUSE_MIN_CONFIDENCE}")
    print(f"Số câu: {len(texts)}")
    for text in texts:
        describe(engine, predict_proba, text)
    print("=" * 78)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
