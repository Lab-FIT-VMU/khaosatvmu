from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_CONFIG = PROJECT_ROOT / "config" / "data-sources.json"
AUDIT_FILES = {
    "uit_vsfc": PROJECT_ROOT / "artifacts" / "dataset-audit.json",
    "neu_esc": PROJECT_ROOT / "artifacts" / "neu-esc-audit.json",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the phase 1 data card for the sentiment corpus.")
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "artifacts")
    return parser.parse_args()


def load_audit(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_audit(source: str, audit: dict[str, object] | None) -> dict[str, object]:
    if audit is None:
        return {"audit_available": False, "note": "Chưa chạy script kiểm toán tương ứng; cần chạy trước khi khóa tập dữ liệu."}
    summary: dict[str, object] = {"audit_available": True, "generated_at_utc": audit.get("generated_at_utc")}
    splits = audit.get("splits", {})
    summary["splits"] = {
        name: {
            "rows": values.get("rows_kept", values.get("rows")),
            "label_distribution": values.get("label_distribution"),
            "rows_excluded_by_label": values.get("rows_excluded_by_label", {}),
            "file_sha256": values.get("file_sha256", values.get("files_sha256")),
        }
        for name, values in splits.items()
    }
    if source == "neu_esc":
        summary["totals"] = audit.get("totals")
        summary["train_overlap_rows_in_eval_splits"] = audit.get("train_overlap_rows_in_eval_splits")
        summary["cross_split_duplicate_text_count"] = audit.get("cross_split_duplicate_text_count")
    else:
        summary["cross_split_duplicate_text_count"] = audit.get("cross_split_duplicate_text_count")
    return summary


def dataset_card_status(source: dict[str, object]) -> dict[str, object]:
    """Check the pinned dataset card so the license claim is auditable offline."""
    evidence = source.get("license_evidence")
    if not evidence:
        return {"available": False, "note": "Nguồn này không có dataset card được ghim."}
    path = PROJECT_ROOT / "data" / "raw" / "neu_esc" / evidence["dataset_card_file"]  # type: ignore[index]
    status: dict[str, object] = {
        "expected_sha256": evidence["dataset_card_sha256"],  # type: ignore[index]
        "frontmatter_quote": evidence["card_frontmatter_quote"],  # type: ignore[index]
        "license_section_quote": evidence["card_license_section_quote"],  # type: ignore[index]
    }
    if not path.is_file():
        status.update(
            {
                "available": False,
                "note": "Dataset card chưa được tải về; chạy scripts/download_neu_esc.py để lấy bản đúng revision.",
            }
        )
        return status
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    status.update(
        {
            "available": True,
            "file": path.name,
            "sha256": digest,
            "matches_pinned_revision": digest == evidence["dataset_card_sha256"],  # type: ignore[index]
        }
    )
    return status


def build_card() -> dict[str, object]:
    config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))
    local_gold = PROJECT_ROOT / "data" / "processed" / "local-gold.csv"
    local_sample_manifest = PROJECT_ROOT / "data" / "processed" / "local-gold-sample.manifest.json"

    card: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "stage": "phase-1",
        "task": {
            "name": "open-comment sentiment, three classes",
            "classes": config["task_labels"]["classes"],
            "derived_labels": config["task_labels"]["derived_labels"],
            "excluded_source_labels": config["task_labels"]["excluded_source_labels"],
            "exclusion_policy": config["task_labels"]["exclusion_policy"],
        },
        "source_roles": config["source_roles"],
        "sources": {},
        "local_holdout": {
            "gold_file_present": local_gold.is_file(),
            "gold_file": local_gold.name,
            "sample_manifest_present": local_sample_manifest.is_file(),
            "note": (
                "A frozen local validation/test split is required before any production claim. "
                "Local text is never committed to Git."
            ),
        },
        "readiness": {},
    }

    for key in ("uit_vsfc", "neu_esc"):
        source = config[key]
        card["sources"][key] = {
            "name": source["name"],
            "origin": source.get("official_dataset") or source.get("official_page"),
            "license": source.get("license"),
            "license_status": source.get("license_status", "declared"),
            "license_verified_from_origin": source.get("license_verified_from_origin", False),
            "license_note": source.get("license_note"),
            "access_requirement": source.get("access_requirement"),
            "revision_pinned": source.get("revision_pinned", source.get("repository_commit_audited")),
            "allowed_stage": source.get("allowed_stage", source.get("status")),
            "role": (
                "licensed training source"
                if key == config["source_roles"]["licensed_training_source"]
                else "in-domain benchmark"
            ),
            "sentiment_mapping": source["sentiment_mapping"],
            "excluded_sentiment_labels": source.get("excluded_sentiment_labels", {}),
            "citation": source["citation"],
            "dataset_card": dataset_card_status(source),
            "audit": summarize_audit(key, load_audit(AUDIT_FILES[key])),
        }

    neu_audit = card["sources"]["neu_esc"]["audit"]  # type: ignore[index]
    uit_audit = card["sources"]["uit_vsfc"]["audit"]  # type: ignore[index]
    card["readiness"] = {
        "licensed_training_source_audited": bool(neu_audit.get("audit_available")),
        "in_domain_benchmark_audited": bool(uit_audit.get("audit_available")),
        "license_evidence_verified": bool(
            card["sources"]["neu_esc"]["dataset_card"].get("matches_pinned_revision")  # type: ignore[index]
        ),
        "toxic_label_excluded_from_three_class_task": True,
        "local_holdout_frozen": local_gold.is_file(),
        "blocking_items": [
            item
            for item in (
                None
                if bool(neu_audit.get("audit_available"))
                else "NEU-ESC files are not downloaded yet: accept the gated conditions and set HF_TOKEN.",
                None if local_gold.is_file() else "Local validation/test gold CSV is not frozen yet.",
                None
                if config["neu_esc"].get("license_verified_from_origin")
                else "NEU-ESC license metadata has not been verified from the origin.",
                None
                if card["sources"]["neu_esc"]["dataset_card"].get("matches_pinned_revision")  # type: ignore[index]
                else "Dataset card của NEU-ESC chưa được tải về và đối chiếu hash với revision đã ghim.",
            )
            if item
        ],
    }
    return card


def render_markdown(card: dict[str, object]) -> str:
    lines = [
        "# Data card — Giai đoạn 1 (ba lớp cảm xúc)",
        "",
        f"- Tạo lúc UTC: `{card['generated_at_utc']}`",
        f"- Nhãn huấn luyện: `{'`, `'.join(card['task']['classes'])}`",
        f"- Nhãn suy ra bằng quy tắc: `{'`, `'.join(card['task']['derived_labels'])}`",
        "- Không gộp `Toxic` của NEU-ESC vào `Negative`; các dòng `Toxic` bị loại khỏi corpus và chỉ được đếm để kiểm toán.",
        "",
    ]
    for key, source in card["sources"].items():
        lines.extend(
            [
                f"## {source['name']}",
                "",
                f"- Vai trò: {source['role']}",
                f"- Nguồn: {source['origin']}",
                f"- Giấy phép: `{source['license']}` (xác minh từ nguồn gốc: {source['license_verified_from_origin']})",
                f"- Điều kiện truy cập: {source['access_requirement']}",
                f"- Phiên bản ghim: `{source['revision_pinned']}`",
                f"- Phạm vi được phép: `{source['allowed_stage']}`",
                f"- Ánh xạ nhãn: {source['sentiment_mapping']}",
                f"- Nhãn nguồn bị loại: {source['excluded_sentiment_labels'] or 'không'}",
                f"- Citation: {source['citation']}",
            ]
        )
        if source.get("license_note"):
            lines.append(f"- Lưu ý giấy phép: {source['license_note']}")
        dataset_card = source.get("dataset_card") or {}
        if dataset_card.get("available"):
            lines.append(
                f"- Dataset card `{dataset_card['file']}` khớp revision đã ghim: "
                f"{dataset_card['matches_pinned_revision']} (`{dataset_card['sha256']}`)"
            )
            lines.append(f"- Trích frontmatter: `{dataset_card['frontmatter_quote']}`")
            lines.append(f"- Trích mục License: “{dataset_card['license_section_quote']}”")
        elif dataset_card.get("note"):
            lines.append(f"- Dataset card: {dataset_card['note']}")
        audit = source["audit"]
        if audit.get("audit_available"):
            lines.extend(["", "| Split | Số dòng | Phân bố nhãn | Dòng bị loại theo nhãn |", "|---|---:|---|---|"])
            for split_name, values in audit["splits"].items():
                lines.append(
                    f"| {split_name} | {values['rows']} | {values['label_distribution']} | "
                    f"{values['rows_excluded_by_label'] or 'không'} |"
                )
        else:
            lines.extend(["", f"Kiểm toán: chưa có. {audit['note']}"])
        lines.append("")

    lines.extend(
        [
            "## Tập giữ riêng local",
            "",
            f"- Đã khóa `local-gold.csv`: {card['local_holdout']['gold_file_present']}",
            f"- {card['local_holdout']['note']}",
            "",
            "## Điều kiện còn thiếu",
            "",
        ]
    )
    blocking = card["readiness"]["blocking_items"]
    if blocking:
        lines.extend(f"- [ ] {item}" for item in blocking)
    else:
        lines.append("- Không còn điều kiện chặn ở phần dữ liệu công khai.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    card = build_card()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "data-card.json").write_text(
        json.dumps(card, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "data-card.md").write_text(render_markdown(card), encoding="utf-8")
    print(json.dumps(card["readiness"], ensure_ascii=False, indent=2))
    print(f"\nData card written to {output_dir / 'data-card.json'} and data-card.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
