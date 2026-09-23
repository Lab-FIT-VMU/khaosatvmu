"""Assemble the ONNX model bundle the .NET backend loads at runtime.

The bundle is intentionally NOT committed: the ONNX file alone is over 500 MB. Any machine that
runs the backend must rebuild it with this script from the local ML artifacts.

    .\\.venv\\Scripts\\python.exe scripts/prepare_backend_model.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output  # noqa: E402

DEFAULT_CHECKPOINT = PROJECT_ROOT / "artifacts" / "phobert_checkpoint"
DEFAULT_ONNX = PROJECT_ROOT / "artifacts" / "phobert-sentiment.onnx"
DEFAULT_TRAINING_SUMMARY = PROJECT_ROOT / "artifacts" / "phobert-training-summary.json"
DEFAULT_OUTPUT = REPO_ROOT / "models" / "open-comment-sentiment"

# Cấu hình ĐANG CHẠY là nguồn duy nhất đúng cho ngưỡng và phiên bản quy tắc. Trước đây script lấy
# ngưỡng từ artifacts/phobert-local-evaluation.json — ảnh chụp của một lượt cân chỉnh cũ — nên
# model-card ghi mixed = 0,35 trong khi sản phẩm chạy 0,20. Model card là thứ người khác đọc để biết
# hệ thống đang chạy cấu hình gì, nên nó phải phản chiếu appsettings, không phản chiếu lịch sử.
DEFAULT_WORKER_SETTINGS = REPO_ROOT / "src" / "Backend" / "SentimentWorker" / "appsettings.json"
DEFAULT_API_SETTINGS = REPO_ROOT / "src" / "Backend" / "API" / "appsettings.json"

# Hai tiến trình dùng chung bốn giá trị này. Lệch nhau nghĩa là worker ghi nhãn theo một cấu hình
# còn API lại đánh giá "còn nợ/đã xong" theo cấu hình khác — hỏng âm thầm, nên script chặn ngay.
SHARED_SETTINGS_KEYS = ("ModelVersion", "RuleVersion", "ConfidenceThreshold", "MixedThreshold")

# Model version ghi vào DB. Đổi giá trị này khi xuất model mới, nếu không worker sẽ
# không phân tích lại các phiếu đã có kết quả cũ.
MODEL_VERSION = "phobert-neu-esc-v1"

# Thứ tự nhãn PHẢI khớp thứ tự logits của model; đọc từ config.json để tự kiểm tra.
EXPECTED_LABELS = ["Negative", "Neutral", "Positive"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the backend ONNX model bundle",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--checkpoint-dir", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--onnx-file", type=Path, default=DEFAULT_ONNX)
    parser.add_argument("--training-summary", type=Path, default=DEFAULT_TRAINING_SUMMARY)
    parser.add_argument(
        "--worker-settings",
        type=Path,
        default=DEFAULT_WORKER_SETTINGS,
        help="appsettings.json của worker — nguồn cho ngưỡng và phiên bản ghi vào model card",
    )
    parser.add_argument(
        "--api-settings",
        type=Path,
        default=DEFAULT_API_SETTINGS,
        help="appsettings.json của API — phải khai báo cùng ngưỡng và cùng phiên bản quy tắc",
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--model-version",
        default=MODEL_VERSION,
        help="phải khớp ModelVersion trong cấu hình đang chạy; lệch thì script dừng",
    )
    parser.add_argument("--force", action="store_true", help="Ghi đè bundle đã tồn tại")
    return parser.parse_args()


def sha256_of(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def read_sentiment_section(path: Path, label: str, require_max_sequence_length: bool) -> dict[str, object]:
    """Đọc mục OpenCommentSentiment trong appsettings và kiểm nó có đủ các khóa dùng chung."""
    if not path.is_file():
        raise SystemExit(f"[error] Thiếu tệp cấu hình {label}: {path}")

    try:
        # utf-8-sig: chịu được BOM. Visual Studio và PowerShell 5.1 đều có thể ghi BOM vào JSON,
        # và json.loads sẽ ném lỗi "Unexpected UTF-8 BOM" nếu đọc bằng utf-8 thuần.
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        section = payload["OpenCommentSentiment"]
    except (json.JSONDecodeError, KeyError) as error:
        raise SystemExit(f"[error] Không đọc được mục OpenCommentSentiment trong {path}: {error}") from error

    missing = [key for key in SHARED_SETTINGS_KEYS if key not in section]
    if missing:
        raise SystemExit(
            f"[error] {path} thiếu {missing}. Bốn khóa {list(SHARED_SETTINGS_KEYS)} phải khai báo "
            "tường minh ở cả appsettings của API lẫn worker: model card lấy phiên bản và ngưỡng từ đó, "
            "nên không được để giá trị mặc định trong mã nguồn gánh thay."
        )

    # API không nạp model nên không cần độ dài chuỗi; worker thì bắt buộc, vì nó quyết định
    # model được nạp để cắt câu ở mức nào.
    if require_max_sequence_length and "MaxSequenceLength" not in section:
        raise SystemExit(f"[error] {path} thiếu MaxSequenceLength.")

    return section


def format_csharp_decimal(value: float) -> str:
    """Mô phỏng định dạng '0.####' của C#: bỏ số 0 thừa ở đuôi và bỏ dấu chấm nếu không còn phần thập phân."""
    text = f"{float(value):.4f}".rstrip("0").rstrip(".")
    return text or "0"


def effective_rule_version(rule_version: str, confidence: float, mixed: float) -> str:
    """Khớp OpenCommentSentimentOptions.EffectiveRuleVersion — ví dụ 'rules-v2:c0.45:m0.2'."""
    return f"{rule_version}:c{format_csharp_decimal(confidence)}:m{format_csharp_decimal(mixed)}"


def display_path(path: Path) -> str:
    """Đường dẫn tương đối so với gốc repo khi được, để model card không mang đường dẫn của một máy."""
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def resolve_runtime_settings(
    worker_path: Path,
    api_path: Path,
    expected_model_version: str,
) -> dict[str, object]:
    """Lấy cấu hình đang chạy và từ chối đóng gói nếu có chỗ không khớp."""
    worker = read_sentiment_section(worker_path, "worker", require_max_sequence_length=True)
    api = read_sentiment_section(api_path, "API", require_max_sequence_length=False)

    disagreements = [
        f"{key}: worker={worker[key]!r} API={api[key]!r}"
        for key in SHARED_SETTINGS_KEYS
        if worker[key] != api[key]
    ]
    if disagreements:
        raise SystemExit(
            "[error] Cấu hình API và worker lệch nhau:\n  "
            + "\n  ".join(disagreements)
            + "\n  Worker ghi nhãn theo một cấu hình, API đánh giá 'còn nợ' theo cấu hình khác. Sửa cho khớp trước."
        )

    if worker["ModelVersion"] != expected_model_version:
        raise SystemExit(
            f"[error] --model-version={expected_model_version!r} nhưng cấu hình đang chạy ghi "
            f"{worker['ModelVersion']!r}. Model card và cột ModelVersion trong DB sẽ nói hai đằng khác nhau."
        )

    # Khi chạy bằng docker compose, ModelVersion còn đi qua biến môi trường của tệp .env. Kiểm luôn
    # cho khỏi lệch: appsettings nói một đằng, .env nói một nẻo thì container chạy theo .env.
    env_override = read_env_model_version()
    if env_override is not None and env_override != str(worker["ModelVersion"]):
        raise SystemExit(
            f"[error] .env đặt OPEN_COMMENT_MODEL_VERSION={env_override!r} nhưng appsettings ghi "
            f"{worker['ModelVersion']!r}. Container sẽ chạy theo .env."
        )

    confidence = float(worker["ConfidenceThreshold"])
    mixed = float(worker["MixedThreshold"])

    return {
        "model_version": str(worker["ModelVersion"]),
        "rule_version": str(worker["RuleVersion"]),
        "effective_rule_version": effective_rule_version(
            str(worker["RuleVersion"]), confidence, mixed
        ),
        "confidence_threshold": confidence,
        "mixed_clause_min_confidence": mixed,
        "max_sequence_length": int(worker["MaxSequenceLength"]),
        "env_model_version": env_override,
        "sources": {
            "worker": display_path(worker_path),
            "api": display_path(api_path),
        },
    }


def read_env_model_version() -> str | None:
    """Đọc OPEN_COMMENT_MODEL_VERSION trong tệp .env nếu có; không có thì trả về None."""
    env_path = REPO_ROOT / ".env"
    if not env_path.is_file():
        return None

    for raw_line in env_path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        line = raw_line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "OPEN_COMMENT_MODEL_VERSION":
            return value.strip().strip('"').strip("'") or None
    return None


def main() -> int:
    # Console Windows mặc định là cp1252 và sẽ ném UnicodeEncodeError khi in tiếng Việt. Script này
    # in tên tệp, phiên bản và ngưỡng, nên phải đặt UTF-8 trước khi in bất cứ thứ gì.
    force_utf8_output()

    args = parse_args()
    checkpoint = args.checkpoint_dir.resolve()
    onnx_file = args.onnx_file.resolve()
    output_dir = args.output_dir.resolve()

    for label, path in (
        ("checkpoint", checkpoint / "vocab.txt"),
        ("checkpoint", checkpoint / "bpe.codes"),
        ("ONNX", onnx_file),
    ):
        if not path.is_file():
            print(f"[error] Thiếu {label}: {path}", file=sys.stderr)
            return 2

    config = json.loads((checkpoint / "config.json").read_text(encoding="utf-8"))
    labels = [config.get("id2label", {}).get(str(index)) for index in range(len(EXPECTED_LABELS))]
    if labels != EXPECTED_LABELS:
        print(
            f"[error] Thứ tự nhãn trong config.json là {labels}, script chỉ chấp nhận {EXPECTED_LABELS}",
            file=sys.stderr,
        )
        return 1

    # Kiểm cấu hình TRƯỚC khi đụng vào thư mục bundle. Với --force thì bước dưới sẽ xoá bundle hiện
    # có; nếu để phép kiểm nằm sau đó, một tệp appsettings sai sẽ phá mất bundle đang chạy được.
    runtime = resolve_runtime_settings(
        args.worker_settings.resolve(),
        args.api_settings.resolve(),
        args.model_version,
    )

    if output_dir.exists():
        if not args.force:
            print(f"[error] {output_dir} đã tồn tại. Dùng --force để ghi đè.", file=sys.stderr)
            return 2
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    copied: dict[str, dict[str, object]] = {}
    for name in ("vocab.txt", "bpe.codes", "added_tokens.json", "tokenizer_config.json"):
        source = checkpoint / name
        if not source.is_file():
            continue
        destination = output_dir / name
        shutil.copy2(source, destination)
        copied[name] = {"bytes": destination.stat().st_size, "sha256": sha256_of(destination)}

    model_destination = output_dir / onnx_file.name
    shutil.copy2(onnx_file, model_destination)

    training_summary: dict[str, object] = {}
    if args.training_summary.is_file():
        training_summary = json.loads(args.training_summary.read_text(encoding="utf-8"))

    model_card = {
        "model_version": runtime["model_version"],
        "rule_version": runtime["rule_version"],
        "effective_rule_version": runtime["effective_rule_version"],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "base_model": config.get("architectures", ["RobertaForSequenceClassification"])[0],
        "source_model": training_summary.get("model_name", "vinai/phobert-base-v2"),
        "dataset": training_summary.get("dataset", "NEU-ESC"),
        "label_order": labels,
        "max_sequence_length": runtime["max_sequence_length"],
        "thresholds": {
            "confidence_threshold": runtime["confidence_threshold"],
            "mixed_clause_min_confidence": runtime["mixed_clause_min_confidence"],
        },
        "runtime_config": {
            "note": (
                "Ngưỡng, phiên bản model và phiên bản quy tắc trong model card này được lấy từ cấu "
                "hình đang chạy, không phải từ artifact cân chỉnh. Cặp (ModelVersion, RuleVersion) là "
                "điều kiện để worker coi một dòng kết quả là còn dùng được."
            ),
            "sources": runtime["sources"],
            "effective_rule_version": runtime["effective_rule_version"],
            "env_model_version": runtime["env_model_version"],
        },
        "test_metrics": training_summary.get("test_metrics", {}),
        "targets": training_summary.get("targets", {}),
        "onnx": {
            "file": model_destination.name,
            "bytes": model_destination.stat().st_size,
            "sha256": sha256_of(model_destination),
        },
        "tokenizer_files": copied,
        "notes": [
            "Suy luận chạy nội bộ bằng ONNX Runtime, không gọi API AI công cộng.",
            "Không ghi nội dung ý kiến vào log; bảng kết quả chỉ lưu nhãn và xác suất.",
            "Nhãn Mixed/Uncertain được suy ra bằng quy tắc ở tầng application, không do model dự đoán.",
            "test_metrics ở đây đo trên tập test NEU-ESC, không phải trên dữ liệu của trường.",
        ],
    }

    (output_dir / "model-card.json").write_text(
        json.dumps(model_card, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[OK] Bundle đã tạo tại {output_dir}")
    print(f"     ONNX: {model_destination.stat().st_size / (1024 * 1024):.2f} MB")
    print(
        f"     ModelVersion={runtime['model_version']}  "
        f"RuleVersion={runtime['effective_rule_version']}"
    )
    print(
        "     thresholds: "
        f"confidence={runtime['confidence_threshold']}, "
        f"mixed={runtime['mixed_clause_min_confidence']}, "
        f"max_sequence_length={runtime['max_sequence_length']}"
    )
    print(f"     (lấy từ {runtime['sources']['worker']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
