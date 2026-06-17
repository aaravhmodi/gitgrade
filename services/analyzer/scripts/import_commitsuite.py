from __future__ import annotations

import argparse
import json
from pathlib import Path

from gitgrade_analyzer.ingestion import weak_label_for_commit
from gitgrade_analyzer.models import CommitFeatures

SOURCE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".cpp",
    ".c",
    ".cs",
    ".swift",
    ".kt",
}
CONFIG_EXTENSIONS = {".yml", ".yaml", ".toml", ".ini", ".cfg", ".json"}
GENERATED_FILE_NAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "cargo.lock",
}
VAGUE_MESSAGES = {"update", "fix", "changes", "final", "misc", "stuff", "work", "wip"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import CommitSuite data into GitGrade JSONL format.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("../../datasets/repos/security-pride__CommitSuite/Ten-category-eval_dataset/all_data.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/commitsuite_gitgrade.jsonl"),
    )
    parser.add_argument("--limit", type=int, default=2000)
    return parser.parse_args()


def classify_file(path: str) -> str:
    lower = path.lower()
    name = Path(lower).name
    parts = set(Path(lower).parts)

    if name in GENERATED_FILE_NAMES or "vendor" in parts or "dist" in parts:
        return "generated"
    if {"test", "tests", "__tests__", "spec", "specs"} & parts:
        return "test"
    if {"docs", "doc"} & parts or lower.endswith(".md"):
        return "docs"
    if Path(lower).suffix in CONFIG_EXTENSIONS or ".github" in parts:
        return "config"
    if Path(lower).suffix in SOURCE_EXTENSIONS:
        return "source"
    return "other"


def is_whitespace_only(modified_files: list[dict]) -> bool:
    changed_lines: list[str] = []
    for item in modified_files:
        diff = item.get("diff", "")
        for line in diff.splitlines():
            if line.startswith(("+++", "---", "@@")):
                continue
            if line.startswith(("+", "-")):
                changed_lines.append(line[1:])
    return bool(changed_lines) and all(not line.strip() for line in changed_lines)


def features_from_record(record: dict) -> CommitFeatures:
    modified_files = record.get("modified_files", [])
    counts = {"source": 0, "test": 0, "docs": 0, "generated": 0, "config": 0}
    lines_added = 0
    lines_deleted = 0

    for item in modified_files:
        path = item.get("new_path") or item.get("old_path") or item.get("filename") or ""
        category = classify_file(path)
        if category in counts:
            counts[category] += 1
        lines_added += int(item.get("added_lines", 0) or 0)
        lines_deleted += int(item.get("deleted_lines", 0) or 0)

    message = str(record.get("msg", "")).splitlines()[0]
    normalized = message.strip().lower()
    total_change = lines_added + lines_deleted

    return CommitFeatures(
        sha=record["hash"],
        message=message,
        files_changed=len(modified_files),
        lines_added=lines_added,
        lines_deleted=lines_deleted,
        source_files_changed=counts["source"],
        test_files_changed=counts["test"],
        docs_files_changed=counts["docs"],
        generated_files_changed=counts["generated"],
        config_files_changed=counts["config"],
        vague_message=normalized in VAGUE_MESSAGES or len(normalized.split()) <= 1,
        issue_reference=bool(record.get("issues") or record.get("prs")),
        tiny_diff=total_change <= 4 and len(modified_files) <= 2,
        whitespace_only=is_whitespace_only(modified_files),
        repeated_message=False,
    )


def main() -> None:
    args = parse_args()
    rows = json.loads(args.input.read_text(encoding="utf-8"))
    selected = rows[: args.limit] if args.limit else rows

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for record in selected:
            features = features_from_record(record)
            payload = {
                "repo": record["repo_name"],
                "label": weak_label_for_commit(features),
                "message_type": record.get("message_type"),
                "commitsuite_description": record.get("description"),
                **features.model_dump(),
            }
            handle.write(json.dumps(payload) + "\n")

    print(f"Imported {len(selected)} CommitSuite commits into {args.output}")


if __name__ == "__main__":
    main()
