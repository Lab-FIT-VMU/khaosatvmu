from __future__ import annotations

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import random

import joblib


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "processed" / "local-gold-sample.csv"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "review"


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def write_annotation_sheet(path: Path, rows: list[dict[str, str]], seed: int) -> None:
    shuffled = list(rows)
    random.Random(seed).shuffle(shuffled)
    fields = ["SampleId", "Text", "SourceGroup", "LengthBucket", "Sentiment", "NeedsAdjudication", "AnnotatorNotes"]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in shuffled:
            writer.writerow({field: row.get(field, "") if field not in {"Sentiment", "NeedsAdjudication", "AnnotatorNotes"} else "" for field in fields})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create blinded annotation sheets and separate model screening.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = read_rows(args.input.resolve())
    if not rows:
        raise ValueError("Local sample is empty")
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    expected_outputs = [
        output_dir / "annotator-a.csv",
        output_dir / "annotator-b.csv",
        output_dir / "model-screening.csv",
        output_dir / "review-pack-summary.json",
    ]
    if not args.overwrite and any(path.exists() for path in expected_outputs):
        raise FileExistsError("Review pack already exists. Use --overwrite explicitly to replace it.")

    write_annotation_sheet(expected_outputs[0], rows, seed=101)
    write_annotation_sheet(expected_outputs[1], rows, seed=202)

    texts = [row["Text"] for row in rows]
    artifact_paths = sorted((PROJECT_ROOT / "artifacts").glob("*.joblib"))
    if not artifact_paths:
        raise FileNotFoundError(
            "No model artifact in artifacts/. Run scripts/train_baseline.py before building the review pack."
        )
    predictions: dict[str, list[str]] = {}
    for path in artifact_paths:
        predictions[path.stem] = list(joblib.load(path).predict(texts))

    model_names = sorted(predictions)
    screening_fields = ["SampleId", *(f"{name}Prediction" for name in model_names), "ModelsAgree", "HumanGold"]
    with expected_outputs[2].open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=screening_fields)
        writer.writeheader()
        for index, row in enumerate(rows):
            labels = [predictions[name][index] for name in model_names]
            writer.writerow(
                {
                    "SampleId": row["SampleId"],
                    **{f"{name}Prediction": predictions[name][index] for name in model_names},
                    "ModelsAgree": len(set(labels)) == 1,
                    "HumanGold": "",
                }
            )

    agreements = [len({predictions[name][index] for name in model_names}) == 1 for index in range(len(rows))]
    summary = {
        "rows": len(rows),
        "model_artifacts": [path.name for path in artifact_paths],
        "model_agreement_count": sum(agreements),
        "model_disagreement_count": len(rows) - sum(agreements),
        "model_agreement_rate": sum(agreements) / len(rows),
        "label_distribution": {
            name: dict(sorted(Counter(predictions[name]).items())) for name in model_names
        },
        "annotation_sheets_blinded_to_model_predictions": True,
        "gold_status": "pending-two-human-annotators-and-adjudication",
        "sample_size_warning": (
            "Only 117 unique local comments exist, below the 200-400 target; a separate frozen test split is not possible."
            if len(rows) < 200
            else None
        ),
    }
    expected_outputs[3].write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
