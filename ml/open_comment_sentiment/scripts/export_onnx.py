"""Export fine-tuned PhoBERT-base-v2 model to ONNX format and verify runtime parity."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sentiment_baseline.console import force_utf8_output
from sentiment_baseline.inference_engine import (
    SentimentInferenceEngine,
    make_onnx_predict_fn,
    make_pytorch_predict_fn,
)
from sentiment_baseline.phobert_model import (
    DEFAULT_MAX_LENGTH,
    load_phobert_model,
    load_phobert_tokenizer,
)

# Ngưỡng đang chạy thật nằm ở appsettings.json của worker. Ở đây ĐỌC LẠI tệp đó thay vì chép lại
# giá trị, để script kiểm thử không trở thành nơi thứ tư giữ một bản sao có thể lệch âm thầm.
WORKER_SETTINGS = REPO_ROOT / "src" / "Backend" / "SentimentWorker" / "appsettings.json"


def load_production_thresholds() -> tuple[float, float] | None:
    """Đọc ngưỡng từ cấu hình worker; trả về None khi không tìm thấy tệp (ví dụ chạy chỉ có thư mục ml)."""
    try:
        section = json.loads(WORKER_SETTINGS.read_text(encoding="utf-8"))["OpenCommentSentiment"]
        return float(section["ConfidenceThreshold"]), float(section["MixedThreshold"])
    except (OSError, KeyError, TypeError, ValueError):
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export fine-tuned PhoBERT to ONNX",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--model-dir", type=Path, default=Path("artifacts/phobert_checkpoint"))
    parser.add_argument("--output-onnx", type=Path, default=Path("artifacts/phobert-sentiment.onnx"))
    parser.add_argument("--opset-version", type=int, default=14)
    # Mặc định PHẢI khớp độ dài lúc chạy thật (OpenCommentSentimentOptions.MaxSequenceLength = 256).
    # Trước đây để 160, tức là model được xuất ra với câu ngắn hơn cả lúc huấn luyện lẫn lúc chạy —
    # lệch âm thầm và không có cảnh báo nào. Trục sequence vẫn động, nên giá trị này chỉ quyết định
    # hình dạng của tensor mồi lúc xuất, không chặn câu dài; nhưng nó là dấu vết duy nhất cho biết
    # model đã được xuất ở mức nào.
    parser.add_argument(
        "--max-length",
        type=int,
        default=DEFAULT_MAX_LENGTH,
        help=(
            "Độ dài tối đa dùng lúc xuất. Phải bằng MaxSequenceLength của lúc chạy thật, "
            "nếu không là lệch giữa lúc dạy và lúc chạy."
        ),
    )
    return parser.parse_args()


def export_to_onnx(
    model: torch.nn.Module,
    tokenizer: Any,
    output_path: Path,
    opset_version: int = 14,
    max_length: int = DEFAULT_MAX_LENGTH,
) -> None:
    """Export PyTorch sequence classification model to ONNX with dynamic batch & length."""
    model.eval()
    model.cpu()

    dummy_text = "Thầy cô giảng dạy rất nhiệt tình và chu đáo."
    encoded = tokenizer(
        dummy_text,
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=max_length,
    )

    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Đang xuất mô hình ra ONNX: {output_path} (opset {opset_version})...")

    torch.onnx.export(
        model,
        (input_ids, attention_mask),
        str(output_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
        opset_version=opset_version,
        do_constant_folding=True,
    )

    # Validate ONNX model structure
    onnx_model = onnx.load(str(output_path))
    onnx.checker.check_model(onnx_model)
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[OK] Đã tạo file ONNX hợp lệ, dung lượng: {file_size_mb:.2f} MB")


def verify_numerical_equivalence(
    model: torch.nn.Module,
    tokenizer: Any,
    onnx_path: Path,
    max_length: int = DEFAULT_MAX_LENGTH,
    tolerance: float = 1e-4,
) -> None:
    """Check that PyTorch and ONNX Runtime produce identical outputs within tolerance."""
    print("Đang kiểm tra tính nhất quán số học (Numerical Parity)...")
    sample_texts = [
        "Bài giảng rất hay và thực tiễn.",
        "Phòng học nóng, máy chiếu bị mờ.",
        "Nội dung bình thường, không có ý kiến.",
        "Thầy dạy nhiệt tình nhưng thiết bị phòng học còn thiếu thốn.",
    ]

    # 1. PyTorch inference
    model.eval()
    model.cpu()
    encoded = tokenizer(
        sample_texts,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=max_length,
    )
    with torch.no_grad():
        torch_outputs = model(**encoded)
        torch_logits = torch_outputs.logits.numpy()
        torch_probs = torch.softmax(torch_outputs.logits, dim=-1).numpy()

    # 2. ONNX Runtime inference
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ort_inputs = {
        "input_ids": encoded["input_ids"].numpy().astype(np.int64),
        "attention_mask": encoded["attention_mask"].numpy().astype(np.int64),
    }
    ort_outputs = session.run(["logits"], ort_inputs)
    ort_logits = ort_outputs[0]

    def softmax(x: np.ndarray) -> np.ndarray:
        exp_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return exp_x / np.sum(exp_x, axis=-1, keepdims=True)

    ort_probs = softmax(ort_logits)

    max_logit_diff = float(np.max(np.abs(torch_logits - ort_logits)))
    max_prob_diff = float(np.max(np.abs(torch_probs - ort_probs)))

    print(f"  - Sai lệch logits cực đại:        {max_logit_diff:.6e}")
    print(f"  - Sai lệch xác suất cực đại:      {max_prob_diff:.6e}")
    print(f"  - Ngưỡng cho phép:                {tolerance:.6e}")

    if max_logit_diff > tolerance or max_prob_diff > tolerance:
        raise ValueError(
            f"ONNX parity check failed! max_logit_diff={max_logit_diff} exceeds tolerance={tolerance}"
        )

    # 3. Test InferenceEngine with ONNX predict function
    print("Kiểm tra bộ suy luận 5 lớp (InferenceEngine) qua ONNX Runtime...")
    thresholds = load_production_thresholds()
    onnx_predict_fn = make_onnx_predict_fn(session, tokenizer, max_length=max_length)
    if thresholds is None:
        confidence_threshold = 0.45
        mixed_threshold = 0.20
        print(
            f"  [cảnh báo] Không đọc được {WORKER_SETTINGS.name} của worker; dùng mặc định "
            f"{confidence_threshold}/{mixed_threshold}. Nhãn in ra dưới đây có thể khác sản phẩm."
        )
    else:
        confidence_threshold, mixed_threshold = thresholds
        print(
            f"  Ngưỡng lấy từ {WORKER_SETTINGS.name}: "
            f"confidence={confidence_threshold}, mixed={mixed_threshold}"
        )

    engine = SentimentInferenceEngine(
        onnx_predict_fn,
        confidence_threshold=confidence_threshold,
        mixed_clause_min_confidence=mixed_threshold,
    )
    results = engine.predict_batch(sample_texts)

    for res in results:
        print(f"  [{res.predicted_label:^9}] (conf={res.confidence:.2f}): {res.text}")

    print("[OK] Toàn bộ kiểm thử ONNX thành công hoàn toàn!")


def main() -> int:
    force_utf8_output()
    args = parse_args()

    print("=== Xuất mô hình PhoBERT sang định dạng ONNX ===")
    print(f"Checkpoint PyTorch: {args.model_dir}")
    print(f"File ONNX đích:     {args.output_onnx}")
    print(f"Độ dài tối đa:      {args.max_length}")
    if args.max_length != DEFAULT_MAX_LENGTH:
        print(
            f"  [cảnh báo] Lúc chạy thật cắt ở {DEFAULT_MAX_LENGTH} token, không phải {args.max_length}. "
            "Xuất ở độ dài khác là dấu hiệu sắp lệch giữa lúc dạy và lúc chạy."
        )

    tokenizer = load_phobert_tokenizer(str(args.model_dir))
    model = load_phobert_model(str(args.model_dir), num_labels=3)

    export_to_onnx(
        model=model,
        tokenizer=tokenizer,
        output_path=args.output_onnx,
        opset_version=args.opset_version,
        max_length=args.max_length,
    )

    verify_numerical_equivalence(
        model=model,
        tokenizer=tokenizer,
        onnx_path=args.output_onnx,
        max_length=args.max_length,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
