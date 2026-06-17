from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from .models import CommitFeatures
from .scoring import score_commit

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
DOC_PATH_MARKERS = {"docs", "doc"}
TEST_PATH_MARKERS = {"test", "tests", "__tests__", "spec", "specs"}
GENERATED_FILE_NAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "cargo.lock",
}
CONFIG_EXTENSIONS = {".yml", ".yaml", ".toml", ".ini", ".cfg"}
VAGUE_MESSAGES = {"update", "fix", "changes", "final", "misc", "stuff", "work", "wip"}


def parse_repo_slug(repo_slug: str) -> tuple[str, str]:
    owner, repo = repo_slug.split("/", maxsplit=1)
    return owner, repo


def _classify_file(path: str) -> str:
    file_path = PurePosixPath(path.lower())
    name = file_path.name
    parts = set(file_path.parts)

    if name in GENERATED_FILE_NAMES or "dist" in parts or "vendor" in parts:
        return "generated"
    if parts & TEST_PATH_MARKERS:
        return "test"
    if parts & DOC_PATH_MARKERS or file_path.suffix == ".md":
        return "docs"
    if file_path.suffix in CONFIG_EXTENSIONS or name.startswith(".github"):
        return "config"
    if file_path.suffix in SOURCE_EXTENSIONS:
        return "source"
    return "other"


def _is_whitespace_only(files: list[dict[str, Any]]) -> bool:
    if not files:
        return False

    patches = [file.get("patch", "") for file in files if "patch" in file]
    if not patches:
        return False

    changed_lines: list[str] = []
    for patch in patches:
        for line in patch.splitlines():
            if line.startswith(("+++", "---", "@@")):
                continue
            if line.startswith(("+", "-")):
                changed_lines.append(line[1:])

    if not changed_lines:
        return False

    return all(not line.strip() for line in changed_lines)


def _is_tiny_diff(total_change: int, files_changed: int) -> bool:
    return total_change <= 4 and files_changed <= 2


def _is_vague_message(message: str) -> bool:
    normalized = message.strip().lower()
    return normalized in VAGUE_MESSAGES or len(normalized.split()) <= 1


def commit_features_from_github_detail(detail: dict[str, Any]) -> CommitFeatures:
    files = detail.get("files", [])
    counts = {
        "source": 0,
        "test": 0,
        "docs": 0,
        "generated": 0,
        "config": 0,
    }

    for file in files:
        category = _classify_file(file.get("filename", ""))
        if category in counts:
            counts[category] += 1

    message = detail["commit"]["message"].splitlines()[0]
    total_change = detail.get("stats", {}).get("total", 0)

    return CommitFeatures(
        sha=detail["sha"],
        message=message,
        files_changed=len(files),
        lines_added=detail.get("stats", {}).get("additions", 0),
        lines_deleted=detail.get("stats", {}).get("deletions", 0),
        source_files_changed=counts["source"],
        test_files_changed=counts["test"],
        docs_files_changed=counts["docs"],
        generated_files_changed=counts["generated"],
        config_files_changed=counts["config"],
        vague_message=_is_vague_message(message),
        issue_reference="#" in message,
        tiny_diff=_is_tiny_diff(total_change, len(files)),
        whitespace_only=_is_whitespace_only(files),
        repeated_message=False,
    )


def weak_label_for_commit(features: CommitFeatures) -> str:
    report = score_commit(features)
    if report.score >= 80:
        return "high_value"
    if report.score >= 60:
        return "medium_value"
    if report.score >= 35:
        return "low_value"
    return "noise"
