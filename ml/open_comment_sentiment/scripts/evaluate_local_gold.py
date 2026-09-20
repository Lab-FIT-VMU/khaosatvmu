from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
ALLOWED_LABELS = ("Negative", "Neutral", "Positive")


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
    return parser.parse_args()


def discover_models(explicit: list[Path] | None) -> list[Path]:
    if explicit:
        return [path.resolve() for path in explicit]
    return sorted(ARTIFACTS_DIR.glob("*.joblib"))


def main() -> int:
    args = parse_args()
    with args.input.resolve().open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError("Gold dataset is empty")
    required = {"Text", "Sentiment"}
    if not required.issubset(rows[0]):
        raise ValueError(f"Gold CSV must contain columns {sorted(required)}")
    invalid = sorted({row["Sentiment"].strip() for row in rows} - set(ALLOWED_LABELS))
    if invalid:
        raise ValueError(f"Blank or invalid gold labels: {invalid}")

    texts = [row["Text"] for row in rows]
    labels = [row["Sentiment"].strip() for row in rows]
    model_paths = discover_models(args.models)
    if not model_paths:
        raise FileNotFoundError(
            f"No model artifact found in {ARTIFACTS_DIR}. Run scripts/train_baseline.py first."
        )

    report: dict[str, object] = {
        "rows": len(rows),
        "label_order": list(ALLOWED_LABELS),
        "gold_file": args.input.resolve().name,
        "models": {},
    }
    for path in model_paths:
        model = joblib.load(path)
        predictions = model.predict(texts)
        report["models"][path.stem] = {
            "artifact": path.name,
            "accuracy": accuracy_score(labels, predictions),
            "macro_f1": f1_score(labels, predictions, labels=list(ALLOWED_LABELS), average="macro"),
            "classification_report": classification_report(
                labels, predictions, labels=list(ALLOWED_LABELS), output_dict=True, zero_division=0
            ),
            "confusion_matrix": confusion_matrix(labels, predictions, labels=list(ALLOWED_LABELS)).tolist(),
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
