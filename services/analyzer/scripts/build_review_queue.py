from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.review import append_jsonl, load_jsonl, reviewed_shas


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a manual review queue from a labeled commit dataset.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("../../datasets/open_source_commits_git.jsonl"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/reviews/review_queue.jsonl"),
    )
    parser.add_argument(
        "--reviewed",
        type=Path,
        default=Path("../../datasets/reviews/manual_labels.jsonl"),
    )
    parser.add_argument("--per-label", type=int, default=20)
    parser.add_argument("--target-total", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)

    rows = load_jsonl(args.dataset)
    already_reviewed = reviewed_shas(args.reviewed)
    buckets: dict[str, list[dict]] = defaultdict(list)

    for row in rows:
        if (row["repo"], row["sha"]) in already_reviewed:
            continue
        buckets[row["label"]].append(row)

    queue: list[dict] = []
    selected_keys: set[tuple[str, str]] = set()
    for label, items in buckets.items():
        sample_size = min(args.per_label, len(items))
        sampled = random.sample(items, sample_size)
        queue.extend(sampled)
        selected_keys.update((row["repo"], row["sha"]) for row in sampled)

    if args.target_total is not None and len(queue) < args.target_total:
        remaining = [
            row
            for row in rows
            if (row["repo"], row["sha"]) not in already_reviewed
            and (row["repo"], row["sha"]) not in selected_keys
        ]
        random.shuffle(remaining)
        needed = args.target_total - len(queue)
        queue.extend(remaining[:needed])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("", encoding="utf-8")
    for row in queue:
        append_jsonl(args.output, row)

    counts: dict[str, int] = defaultdict(int)
    for row in queue:
        counts[row["label"]] += 1
    print(f"Wrote {len(queue)} review items to {args.output}")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
