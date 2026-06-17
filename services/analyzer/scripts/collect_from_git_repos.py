from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from gitgrade_analyzer.ingestion import VAGUE_MESSAGES, _classify_file, weak_label_for_commit
from gitgrade_analyzer.models import CommitFeatures


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clone public repos and derive commit features from git history.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("../../datasets/open_source_repo_manifest.json"),
        help="Path to a JSON array of owner/repo strings.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/open_source_commits_git.jsonl"),
        help="Path to the JSONL dataset to write.",
    )
    parser.add_argument(
        "--repos-dir",
        type=Path,
        default=Path("../../datasets/repos"),
        help="Directory used for local clones.",
    )
    parser.add_argument(
        "--max-repos",
        type=int,
        default=3,
        help="How many repositories to clone.",
    )
    parser.add_argument(
        "--commits-per-repo",
        type=int,
        default=75,
        help="How many commits to extract from each repository.",
    )
    parser.add_argument(
        "--clone-depth",
        type=int,
        default=150,
        help="Depth for shallow clones.",
    )
    return parser.parse_args()


def run_git(args: list[str], cwd: Path | None = None) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed.stdout


def ensure_repo_clone(repo_slug: str, repos_dir: Path, clone_depth: int) -> Path:
    target = repos_dir / repo_slug.replace("/", "__")
    if target.exists():
        run_git(["fetch", "--depth", str(clone_depth), "origin"], cwd=target)
        return target

    target.parent.mkdir(parents=True, exist_ok=True)
    run_git(
        [
            "clone",
            "--depth",
            str(clone_depth),
            f"https://github.com/{repo_slug}.git",
            str(target),
        ]
    )
    return target


def parse_log_output(output: str) -> list[dict[str, object]]:
    commits: list[dict[str, object]] = []
    current: dict[str, object] | None = None

    for raw_line in output.splitlines():
        line = raw_line.rstrip("\n")
        if line.startswith("COMMIT\t"):
            _, sha, message = line.split("\t", maxsplit=2)
            current = {"sha": sha, "message": message, "files": []}
            commits.append(current)
            continue

        if current is None or not line.strip():
            continue

        parts = line.split("\t")
        if len(parts) != 3:
            continue

        added, deleted, path = parts
        file_record = {
            "added": 0 if added == "-" else int(added),
            "deleted": 0 if deleted == "-" else int(deleted),
            "path": path,
        }
        current["files"].append(file_record)

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


def main() -> None:
    args = parse_args()
    repos = json.loads(args.manifest.read_text(encoding="utf-8"))[: args.max_repos]
    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    collected = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for repo_slug in repos:
            repo_dir = ensure_repo_clone(repo_slug, args.repos_dir, args.clone_depth)
            log_output = run_git(
                [
                    "log",
                    f"-n{args.commits_per_repo}",
                    "--pretty=format:COMMIT\t%H\t%s",
                    "--numstat",
                    "--no-renames",
                ],
                cwd=repo_dir,
            )
            records = parse_log_output(log_output)

            for record in records:
                features = commit_features_from_git_record(record)
                payload = {
                    "repo": repo_slug,
                    "label": weak_label_for_commit(features),
                    **features.model_dump(),
                }
                handle.write(json.dumps(payload) + "\n")
                collected += 1

    print(f"Collected {collected} commits into {output_path}")


if __name__ == "__main__":
    main()
