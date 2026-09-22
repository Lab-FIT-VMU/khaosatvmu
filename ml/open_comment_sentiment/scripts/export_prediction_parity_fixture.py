"""Export a prediction parity fixture: the Python 5-class engine's output on synthetic sentences.

The C# backend reimplements tokenizer + ONNX + softmax + Mixed/Uncertain rules. Splitting that
pipeline across two languages means four places to drift silently, so the backend test asserts the
final label AND confidence for every case here.

Synthetic sentences only â€” no student comment text leaves the local database.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


import onnxruntime as ort

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from sentiment_baseline.console import force_utf8_output
from sentiment_baseline.inference_engine import SentimentInferenceEngine, make_onnx_predict_fn
from sentiment_baseline.phobert_model import load_phobert_tokenizer
from export_tokenizer_parity_fixture import EXTRA_CASES

REGRESSION_FIXTURE = PROJECT_ROOT / "data" / "fixtures" / "regression-comments.csv"
DEFAULT_ONNX = PROJECT_ROOT / "artifacts" / "phobert-sentiment.onnx"
DEFAULT_CHECKPOINT = PROJECT_ROOT / "artifacts" / "phobert_checkpoint"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "fixtures" / "phobert-prediction-parity.json"

WARNING = (
    "Fixture tá»•ng há»£p: nhÃ£n vÃ  Ä‘á»™ tin cáº­y do chÃ­nh engine Python sinh ra, dÃ¹ng Ä‘á»ƒ kiá»ƒm tra báº£n "
    "C# cho ra cÃ¹ng káº¿t quáº£. KHÃ”NG pháº£i metric cháº¥t lÆ°á»£ng mÃ´ hÃ¬nh â€” engine tá»± cháº¥m chÃ­nh nÃ³."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export prediction parity fixture for the C# backend")
    parser.add_argument("--onnx-file", type=Path, default=DEFAULT_ONNX)
    parser.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--regression-fixture", type=Path, default=REGRESSION_FIXTURE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--confidence-threshold", type=float, default=0.45)
    parser.add_argument("--mixed-threshold", type=float, default=0.20)
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def collect_cases(regression_fixture: Path) -> list[tuple[str, str]]:
    cases: list[tuple[str, str]] = []
    if regression_fixture.is_file():
        with regression_fixture.open("r", encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                cases.append((row["CaseId"], row["Text"]))
    cases.extend(EXTRA_CASES)
    return cases


def main() -> int:
    force_utf8_output()
    args = parse_args()

    if not args.onnx_file.is_file():
        print(f"[error] Thiáº¿u tá»‡p ONNX: {args.onnx_file}", file=sys.stderr)
        return 2

    tokenizer = load_phobert_tokenizer(str(args.checkpoint_dir))
    session = ort.InferenceSession(str(args.onnx_file), providers=["CPUExecutionProvider"])
    predict_fn = make_onnx_predict_fn(session, tokenizer, batch_size=32, max_length=args.max_length)

    engine = SentimentInferenceEngine(
        predict_proba_fn=predict_fn,
        confidence_threshold=args.confidence_threshold,
        mixed_clause_min_confidence=args.mixed_threshold,
    )

    cases = collect_cases(args.regression_fixture)
    results = engine.predict_batch([text for _, text in cases])

    encoded_cases: list[dict[str, object]] = []
    for (case_id, text), result in zip(cases, results):
        encoded_cases.append(
            {
                "case_id": case_id,
                "text": text,
                "label": result.predicted_label,
                "confidence": float(result.confidence),
                "base_label": result.base_label,
                "base_probabilities": {k: float(v) for k, v in result.base_probabilities.items()},
            }
        )

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": WARNING,
        "is_synthetic": True,
        "engine": "SentimentInferenceEngine",
        "confidence_threshold": args.confidence_threshold,
        "mixed_threshold": args.mixed_threshold,
        "max_length": args.max_length,
        "case_count": len(encoded_cases),
        "cases": encoded_cases,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    labels: dict[str, int] = {}
    for case in encoded_cases:
        labels[str(case["label"])] = labels.get(str(case["label"]), 0) + 1

    print(f"[OK] ÄÃ£ ghi {len(encoded_cases)} ca vÃ o {args.output}")
    print(f"     PhÃ¢n bá»‘ nhÃ£n cá»§a engine Python: {labels}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
