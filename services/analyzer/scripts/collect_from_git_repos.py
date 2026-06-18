from __future__ import annotations

import argparse
import json
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.git_history import commit_features_from_git_record, git_log_records, run_git
from gitgrade_analyzer.ingestion import weak_label_for_commit


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


def main() -> None:
    args = parse_args()
    repos = json.loads(args.manifest.read_text(encoding="utf-8"))[: args.max_repos]
    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    collected = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for repo_slug in repos:
            repo_dir = ensure_repo_clone(repo_slug, args.repos_dir, args.clone_depth)
            records = git_log_records(repo_dir, args.commits_per_repo)

            for record in records:
                features = commit_features_from_git_record(record)
                payload = {
                    "repo": repo_slug,
                    "label": weak_label_for_commit(features),
                    "author_name": record["author_name"],
                    "author_email": record["author_email"],
                    **features.model_dump(),
                }
                handle.write(json.dumps(payload) + "\n")
                collected += 1

    print(f"Collected {collected} commits into {output_path}")


if __name__ == "__main__":
    main()
