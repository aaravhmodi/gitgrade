from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

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
    for label, items in buckets.items():
        sample_size = min(args.per_label, len(items))
        queue.extend(random.sample(items, sample_size))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("", encoding="utf-8")
    for row in queue:
        append_jsonl(args.output, row)

    counts = {label: min(args.per_label, len(items)) for label, items in buckets.items()}
    print(f"Wrote {len(queue)} review items to {args.output}")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
