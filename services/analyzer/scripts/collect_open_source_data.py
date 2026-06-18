from __future__ import annotations

import argparse
import json
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.github_client import GithubClient, GithubCommitSource
from gitgrade_analyzer.ingestion import commit_features_from_github_detail, parse_repo_slug, weak_label_for_commit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect public GitHub commits into a GitGrade training dataset.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("../../datasets/open_source_repo_manifest.json"),
        help="Path to a JSON array of owner/repo strings.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/open_source_commits_collected.jsonl"),
        help="Path to the JSONL dataset to write.",
    )
    parser.add_argument(
        "--per-repo",
        type=int,
        default=20,
        help="Number of recent commits to collect from each repository.",
    )
    parser.add_argument(
        "--max-repos",
        type=int,
        default=None,
        help="Optional cap on how many repositories to read from the manifest.",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="Optional GitHub token. Public API works without one but rate limits are lower.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repos = json.loads(args.manifest.read_text(encoding="utf-8"))
    if args.max_repos is not None:
        repos = repos[: args.max_repos]
    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = GithubClient(token=args.token)
    collected = 0

    with output_path.open("w", encoding="utf-8") as handle:
        for repo_slug in repos:
            owner, repo = parse_repo_slug(repo_slug)
            source = GithubCommitSource(owner=owner, repo=repo)
            commits = client.fetch_recent_commits(source, limit=args.per_repo)

            for commit in commits:
                detail = client.fetch_commit_detail(source, commit["sha"])
                features = commit_features_from_github_detail(detail)
                weak_label = weak_label_for_commit(features)
                payload = {
                    "repo": repo_slug,
                    "label": weak_label,
                    **features.model_dump(),
                }
                handle.write(json.dumps(payload) + "\n")
                collected += 1

    print(f"Collected {collected} commits into {output_path}")


if __name__ == "__main__":
    main()
