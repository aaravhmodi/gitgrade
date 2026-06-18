from __future__ import annotations

import argparse
import json
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.git_history import commit_features_from_git_record, git_log_records, run_git
from gitgrade_analyzer.github_client import GithubClient
from gitgrade_analyzer.ingestion import weak_label_for_commit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect likely user-authored commits from a GitHub user's public repos.")
    parser.add_argument("--username", type=str, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/github_user_commits.jsonl"),
    )
    parser.add_argument(
        "--repos-dir",
        type=Path,
        default=Path("../../datasets/user_repos"),
    )
    parser.add_argument("--max-repos", type=int, default=12)
    parser.add_argument("--commits-per-repo", type=int, default=200)
    parser.add_argument("--clone-depth", type=int, default=250)
    parser.add_argument("--token", type=str, default=None)
    return parser.parse_args()


def ensure_repo_clone(repo_slug: str, repos_dir: Path, clone_depth: int) -> Path:
    target = repos_dir / repo_slug.replace("/", "__")
    if target.exists():
        run_git(["fetch", "--depth", str(clone_depth), "origin"], cwd=target, safe_directory=target)
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


def author_matches(record: dict[str, object], username: str, profile_name: str | None) -> bool:
    username_lower = username.lower()
    author_name = str(record["author_name"]).lower()
    author_email = str(record["author_email"]).lower()

    if username_lower in author_name or username_lower in author_email:
        return True
    if profile_name and profile_name.lower() in author_name:
        return True
    if "noreply.github.com" in author_email and username_lower in author_email:
        return True
    return False


def main() -> None:
    args = parse_args()
    client = GithubClient(token=args.token)
    profile = client.fetch_user_profile(args.username)
    repos = client.fetch_user_repositories(args.username, per_page=min(args.max_repos, 100))
    owned_repos = [repo for repo in repos if repo.get("owner", {}).get("login", "").lower() == args.username.lower()]
    selected_repos = owned_repos[: args.max_repos]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    collected = 0
    with args.output.open("w", encoding="utf-8") as handle:
        for repo in selected_repos:
            repo_slug = repo["full_name"]
            repo_dir = ensure_repo_clone(repo_slug, args.repos_dir, args.clone_depth)
            records = git_log_records(repo_dir, args.commits_per_repo)

            for record in records:
                if not author_matches(record, args.username, profile.get("name")):
                    continue

                features = commit_features_from_git_record(record)
                payload = {
                    "repo": repo_slug,
                    "label": weak_label_for_commit(features),
                    "source": "github_user",
                    "author_name": record["author_name"],
                    "author_email": record["author_email"],
                    **features.model_dump(),
                }
                handle.write(json.dumps(payload) + "\n")
                collected += 1

    print(f"Collected {collected} likely user-authored commits into {args.output}")


if __name__ == "__main__":
    main()
