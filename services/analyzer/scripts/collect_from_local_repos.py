from __future__ import annotations

import argparse
import json
from pathlib import Path

from gitgrade_analyzer.git_history import commit_features_from_git_record, git_log_records
from gitgrade_analyzer.ingestion import weak_label_for_commit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect commit data from local git repositories.")
    parser.add_argument(
        "--repos",
        nargs="+",
        type=Path,
        required=True,
        help="One or more local repository paths.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/local_user_commits.jsonl"),
    )
    parser.add_argument("--commits-per-repo", type=int, default=150)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    collected = 0
    with args.output.open("w", encoding="utf-8") as handle:
        for repo_dir in args.repos:
            records = git_log_records(repo_dir, args.commits_per_repo)
            repo_name = repo_dir.name
            for record in records:
                features = commit_features_from_git_record(record)
                payload = {
                    "repo": repo_name,
                    "label": weak_label_for_commit(features),
                    "source": "local_repo",
                    "author_name": record["author_name"],
                    "author_email": record["author_email"],
                    **features.model_dump(),
                }
                handle.write(json.dumps(payload) + "\n")
                collected += 1

    print(f"Collected {collected} local commits into {args.output}")


if __name__ == "__main__":
    main()
