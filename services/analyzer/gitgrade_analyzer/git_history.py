from __future__ import annotations

import subprocess
from pathlib import Path

from .ingestion import VAGUE_MESSAGES, _classify_file
from .models import CommitFeatures


def run_git(args: list[str], cwd: Path | None = None, safe_directory: Path | None = None) -> str:
    command = ["git"]
    if safe_directory is not None:
        command.extend(["-c", f"safe.directory={safe_directory.as_posix()}"])
    command.extend(args)

    completed = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed.stdout


def parse_log_output(output: str) -> list[dict[str, object]]:
    commits: list[dict[str, object]] = []
    current: dict[str, object] | None = None

    for raw_line in output.splitlines():
        line = raw_line.rstrip("\n")
        if line.startswith("COMMIT\t"):
            _, sha, author_name, author_email, message = line.split("\t", maxsplit=4)
            current = {
                "sha": sha,
                "author_name": author_name,
                "author_email": author_email,
                "message": message,
                "files": [],
            }
            commits.append(current)
            continue

        if current is None or not line.strip():
            continue

        parts = line.split("\t")
        if len(parts) != 3:
            continue

        added, deleted, path = parts
        current["files"].append(
            {
                "added": 0 if added == "-" else int(added),
                "deleted": 0 if deleted == "-" else int(deleted),
                "path": path,
            }
        )

    return commits


def commit_features_from_git_record(record: dict[str, object]) -> CommitFeatures:
    files = record["files"]
    counts = {
        "source": 0,
        "test": 0,
        "docs": 0,
        "generated": 0,
        "config": 0,
    }
    additions = 0
    deletions = 0

    for file_record in files:
        path = file_record["path"]
        category = _classify_file(path)
        if category in counts:
            counts[category] += 1
        additions += file_record["added"]
        deletions += file_record["deleted"]

    message = str(record["message"])
    normalized = message.strip().lower()
    tiny_diff = additions + deletions <= 4 and len(files) <= 2
    whitespace_only = additions + deletions > 0 and counts["source"] > 0 and additions + deletions <= len(files) * 2

    return CommitFeatures(
        sha=str(record["sha"]),
        message=message,
        files_changed=len(files),
        lines_added=additions,
        lines_deleted=deletions,
        source_files_changed=counts["source"],
        test_files_changed=counts["test"],
        docs_files_changed=counts["docs"],
        generated_files_changed=counts["generated"],
        config_files_changed=counts["config"],
        vague_message=normalized in VAGUE_MESSAGES or len(normalized.split()) <= 1,
        issue_reference="#" in message,
        tiny_diff=tiny_diff,
        whitespace_only=whitespace_only,
        repeated_message=False,
    )


def git_log_records(repo_dir: Path, commits_per_repo: int) -> list[dict[str, object]]:
    output = run_git(
        [
            "log",
            f"-n{commits_per_repo}",
            "--pretty=format:COMMIT\t%H\t%an\t%ae\t%s",
            "--numstat",
            "--no-renames",
        ],
        cwd=repo_dir,
        safe_directory=repo_dir,
    )
    return parse_log_output(output)
