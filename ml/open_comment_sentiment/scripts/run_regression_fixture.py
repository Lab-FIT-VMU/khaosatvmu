from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import joblib


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = PROJECT_ROOT / "data" / "fixtures" / "regression-comments.csv"
BASE_LABELS = ("Negative", "Neutral", "Positive")
DERIVED_LABELS = ("Mixed", "Uncertain")

WARNING = (
    "Bộ fixture này là dữ liệu tổng hợp do nhóm kỹ thuật đặt nhãn tham chiếu. "
    "Nó chỉ dùng để phát hiện hồi quy khi sửa tiền xử lý/tokenizer/vectorizer. "
    "Kết quả ở đây KHÔNG phải metric chất lượng mô hình và không thay thế tập test local do người gán nhãn."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run trained baselines over the synthetic regression fixture.")
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument("--artifacts-dir", type=Path, default=PROJECT_ROOT / "artifacts")
    parser.add_argument("--models", type=Path, nargs="*", help="Model artifacts; defaults to artifacts/*.joblib")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    fixture = args.fixture.resolve()
    if not fixture.is_file():
        print(f"Missing fixture: {fixture}", file=sys.stderr)
        return 2
    with fixture.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))

    artifacts_dir = args.artifacts_dir.resolve()
    model_paths = [path.resolve() for path in args.models] if args.models else sorted(artifacts_dir.glob("*.joblib"))
    if not model_paths:
        print(
            f"No model artifact in {artifacts_dir}. Run scripts/train_baseline.py first.",
            file=sys.stderr,
        )
        return 2

    texts = [row["Text"] for row in rows]
    report: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": WARNING,
        "fixture": fixture.name,
        "fixture_rows": len(rows),
        "is_synthetic": True,
        "models": {},
    }

    for path in model_paths:
        model = joblib.load(path)
        predictions = list(model.predict(texts))
        comparable = [
            index
            for index, row in enumerate(rows)
            if row["ReferenceSentiment"] in BASE_LABELS
        ]
        agreements = sum(1 for index in comparable if predictions[index] == rows[index]["ReferenceSentiment"])
        report["models"][path.stem] = {
            "artifact": path.name,
            "predictions": {
                row["CaseId"]: {
                    "reference": row["ReferenceSentiment"],
                    "predicted": predictions[index],
                    "edge_case": row["EdgeCase"],
                    "needs_adjudication": row["NeedsAdjudication"].strip().upper() == "Y",
                }
                for index, row in enumerate(rows)
            },
            "comparable_rows": len(comparable),
            "derived_label_rows": len(rows) - len(comparable),
            "regression_reference_agreement": agreements / len(comparable) if comparable else None,
        }

    reference_path = artifacts_dir / "regression-reference.json"
    if reference_path.is_file():
        previous = json.loads(reference_path.read_text(encoding="utf-8"))
        changed: dict[str, list[str]] = {}
        for name, payload in report["models"].items():  # type: ignore[union-attr]
            old = previous.get("models", {}).get(name, {}).get("predictions", {})
            changed[name] = sorted(
                case_id
                for case_id, values in payload["predictions"].items()
                if case_id in old and old[case_id]["predicted"] != values["predicted"]
            )
        report["changed_since_last_run"] = changed

    output = artifacts_dir / "regression-predictions.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(WARNING + "\n")
    for name, payload in report["models"].items():  # type: ignore[union-attr]
        agreement = payload["regression_reference_agreement"]
        agreement_text = f"{agreement:.2%}" if agreement is not None else "không có câu nào so sánh được"
        print(f"{name}: {payload['comparable_rows']} câu so sánh được, khớp nhãn tham chiếu: {agreement_text}")
    if "changed_since_last_run" in report:
        print("\nThay đổi dự đoán so với lần chạy trước:")
        for name, cases in report["changed_since_last_run"].items():  # type: ignore[union-attr]
            print(f"  {name}: {cases or 'không đổi'}")
    else:
        print(f"\nChưa có {reference_path.name} để so sánh hồi quy; đã ghi mốc mới vào {output.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
