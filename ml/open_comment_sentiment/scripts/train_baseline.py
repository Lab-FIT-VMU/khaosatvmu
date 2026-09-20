from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.multiclass import OneVsRestClassifier
from sklearn.svm import LinearSVC


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.corpus import (  # noqa: E402
    COMBINED_SPEC,
    NEU_ESC_SOURCE,
    SOURCES,
    UIT_VSFC_SOURCE,
    build_corpus,
)
from sentiment_baseline.data import LABEL_NAMES, DatasetUnavailableError  # noqa: E402

SOURCE_CONFIG = PROJECT_ROOT / "config" / "data-sources.json"
DEFAULT_UIT_DIR = PROJECT_ROOT / "data" / "raw" / "uit_vsfc"
DEFAULT_NEU_DIR = PROJECT_ROOT / "data" / "raw" / "neu_esc"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Train reproducible TF-IDF sentiment baselines and run the source ablation "
            "(UIT-VSFC benchmark vs NEU-ESC licensed training source vs both)."
        )
    )
    parser.add_argument(
        "--source",
        default="all",
        help=(
            "Source spec: 'uit-vsfc', 'neu-esc', 'uit-vsfc+neu-esc' or 'all'. "
            "'all' trains every experiment so the ablation is directly comparable."
        ),
    )
    parser.add_argument("--uit-dir", type=Path, default=DEFAULT_UIT_DIR)
    parser.add_argument("--neu-esc-dir", type=Path, default=DEFAULT_NEU_DIR)
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "artifacts")
    parser.add_argument(
        "--keep-eval-overlap",
        action="store_true",
        help="Keep evaluation rows whose text also appears in the training split (not recommended).",
    )
    return parser.parse_args()


def experiment_specs(requested: str) -> list[str]:
    if requested.strip().casefold() in ("all", "ablation"):
        return [*SOURCES, COMBINED_SPEC]
    return [requested]


def features() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_features=60_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    max_features=100_000,
                    sublinear_tf=True,
                ),
            ),
        ]
    )


def models() -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline(
            [
                ("features", features()),
                (
                    "classifier",
                    OneVsRestClassifier(
                        LogisticRegression(
                            class_weight="balanced",
                            max_iter=2_000,
                            random_state=42,
                            solver="liblinear",
                        )
                    ),
                ),
            ]
        ),
        "linear_svm": Pipeline(
            [
                ("features", features()),
                ("classifier", LinearSVC(class_weight="balanced", random_state=42)),
            ]
        ),
    }


def evaluate(model: Pipeline, name: str, texts: list[str], labels: list[str]) -> dict[str, object]:
    started = time.perf_counter()
    predictions = model.predict(texts)
    elapsed = time.perf_counter() - started
    report = classification_report(
        labels,
        predictions,
        labels=list(LABEL_NAMES),
        output_dict=True,
        zero_division=0,
    )
    return {
        "evaluation_set": name,
        "rows": len(texts),
        "label_distribution": {
            label: sum(1 for value in labels if value == label) for label in LABEL_NAMES
        },
        "accuracy": accuracy_score(labels, predictions),
        "macro_f1": f1_score(labels, predictions, labels=list(LABEL_NAMES), average="macro"),
        "negative_recall": report["Negative"]["recall"],
        "classification_report": report,
        "confusion_matrix": confusion_matrix(labels, predictions, labels=list(LABEL_NAMES)).tolist(),
        "inference_seconds": elapsed,
        "milliseconds_per_row": elapsed * 1_000 / len(texts),
    }


def evaluation_targets(corpus_splits: dict[str, object], sources: tuple[str, ...]) -> list[tuple[str, object]]:
    """Return `(label, split)` pairs: one per source test split plus the merged test split."""
    targets: list[tuple[str, object]] = []
    test_split = corpus_splits["test"]
    for source in sources:
        subset = test_split.subset(source)  # type: ignore[attr-defined]
        if subset.rows:
            targets.append((f"test:{source}", subset))
    if len(sources) > 1:
        targets.append(("test:merged", test_split))
    return targets


def render_markdown(report: dict[str, object]) -> str:
    experiments = report["experiments"]
    lines = [
        "# Báo cáo baseline ba lớp cảm xúc — Giai đoạn 1",
        "",
        f"- Thời điểm UTC: `{report['generated_at_utc']}`",
        "- Nhãn: `Negative`, `Neutral`, `Positive`.",
        "- `Toxic` của NEU-ESC bị loại khỏi tập huấn luyện, không gộp vào `Negative`.",
        "- Phạm vi: thử nghiệm offline; chưa được duyệt cho production.",
        "",
        "## Thí nghiệm đối chứng theo nguồn dữ liệu",
        "",
        "| Thí nghiệm (tập train) | Mô hình | Tập đánh giá | Macro F1 | Accuracy | Recall Negative | F1 Neutral |",
        "|---|---|---|---:|---:|---:|---:|",
    ]
    for experiment, payload in experiments.items():
        for model_name, result in payload["models"].items():
            for evaluation in result["evaluations"]:
                classification = evaluation["classification_report"]
                lines.append(
                    f"| `{experiment}` | {model_name} | {evaluation['evaluation_set']} | "
                    f"{evaluation['macro_f1']:.4f} | {evaluation['accuracy']:.4f} | "
                    f"{evaluation['negative_recall']:.4f} | {classification['Neutral']['f1-score']:.4f} |"
                )

    lines.extend(
        [
            "",
            "## Quy mô và phân bố tập dữ liệu",
            "",
            "| Thí nghiệm | Split | Số dòng | Số dòng theo nguồn | Phân bố nhãn |",
            "|---|---|---:|---|---|",
        ]
    )
    for experiment, payload in experiments.items():
        for split_name, split_info in payload["corpus_manifest"]["splits"].items():
            lines.append(
                f"| `{experiment}` | {split_name} | {split_info['rows']} | "
                f"{split_info['rows_by_source']} | {split_info['label_distribution']} |"
            )

    lines.extend(["", "## Ghi chú", ""])
    lines.extend(f"- {note}" for note in report["notes"])
    lines.extend(
        [
            "",
            "Metric trên UIT-VSFC và NEU-ESC không thay thế kết quả trên tập test local đóng băng.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    source_config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))
    drop_overlap = not args.keep_eval_overlap

    report: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "label_order": list(LABEL_NAMES),
        "excluded_source_labels": source_config["task_labels"]["excluded_source_labels"],
        "source_provenance": {
            key: {
                "license": value.get("license"),
                "license_verified_from_origin": value.get("license_verified_from_origin", False),
                "allowed_stage": value.get("allowed_stage", value.get("status")),
                "access_requirement": value.get("access_requirement"),
                "revision_pinned": value.get("revision_pinned", value.get("repository_commit_audited")),
            }
            for key, value in source_config.items()
            if key in ("uit_vsfc", "neu_esc")
        },
        "experiments": {},
        "notes": [],
    }

    # Build every corpus before training so a missing source fails atomically
    # instead of leaving a half-written ablation in artifacts/.
    corpora: dict[str, object] = {}
    for spec in experiment_specs(args.source):
        try:
            corpora[spec] = build_corpus(
                spec,
                uit_root=args.uit_dir,
                neu_root=args.neu_esc_dir,
                drop_train_duplicates_from_eval=drop_overlap,
            )
        except DatasetUnavailableError as error:
            print(error.args[0], file=sys.stderr)
            return 2

    for spec, corpus in corpora.items():
        experiment: dict[str, object] = {
            "sources": list(corpus.sources),
            "train_rows": corpus.splits["train"].rows,
            "corpus_manifest": corpus.manifest,
            "models": {},
        }

        for name, model in models().items():
            print(f"[{spec}] training {name} on {corpus.splits['train'].rows} rows...", flush=True)
            started = time.perf_counter()
            model.fit(corpus.splits["train"].texts, corpus.splits["train"].labels)
            training_seconds = time.perf_counter() - started

            evaluations = [
                evaluate(model, label, target.texts, target.labels)
                for label, target in evaluation_targets(corpus.splits, corpus.sources)
            ]
            experiment["models"][name] = {
                "training_seconds": training_seconds,
                "evaluations": evaluations,
            }
            joblib.dump(model, output_dir / f"{spec}__{name}.joblib", compress=3)
            summary = ", ".join(
                f"{item['evaluation_set']} macro F1={item['macro_f1']:.4f}" for item in evaluations
            )
            print(f"[{spec}] {name}: {summary}", flush=True)

        report["experiments"][spec] = experiment

    used_sources = {source for payload in report["experiments"].values() for source in payload["sources"]}
    if UIT_VSFC_SOURCE in used_sources:
        report["notes"].append(
            "UIT-VSFC chưa có tệp giấy phép: chỉ dùng làm benchmark trong miền, "
            "không dùng làm nguồn duy nhất cho artifact triển khai."
        )
    if NEU_ESC_SOURCE in used_sources:
        report["notes"].append(
            "NEU-ESC khai báo `Apache-2.0` trong metadata của bộ dữ liệu và là nguồn huấn luyện "
            "có giấy phép rõ cho artifact ba lớp; nhãn `Toxic` bị loại hoàn toàn."
        )
        report["notes"].append(
            "NEU-ESC lệch mạnh về lớp `Neutral`, còn UIT-VSFC lệch về `Positive`/`Negative`; "
            "vì vậy metric luôn được báo cáo riêng theo từng nguồn thay vì chỉ một con số trộn."
        )
    report["notes"].append(
        "Đã loại dòng trùng trong cùng một split và dòng dev/test trùng nội dung với tập train "
        f"(drop_train_duplicates_from_eval={drop_overlap})."
    )

    (output_dir / "baseline-results.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_dir / "baseline-report.md").write_text(render_markdown(report), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
