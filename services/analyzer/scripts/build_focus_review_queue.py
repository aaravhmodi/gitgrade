from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.review import append_jsonl, load_jsonl, reviewed_shas

PRIORITY_LABELS = ["noise", "low_value", "medium_value"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a focused review queue for harder label boundaries.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("../../datasets/user_history_combined.jsonl"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/reviews/focus_review_queue.jsonl"),
    )
    parser.add_argument(
        "--reviewed",
        type=Path,
        default=Path("../../datasets/reviews/manual_labels.jsonl"),
    )
    parser.add_argument("--target-total", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def priority_score(row: dict) -> tuple[int, int, int]:
    total_change = int(row.get("lines_added", 0)) + int(row.get("lines_deleted", 0))
    score = 0
    if row["label"] == "noise":
        score += 5
    if row["label"] == "low_value":
        score += 4
    if row["label"] == "medium_value":
        score += 3
    if row.get("tiny_diff"):
        score += 2
    if row.get("vague_message"):
        score += 2
    if row.get("generated_files_changed", 0):
        score += 1
    return (score, -abs(total_change - 20), random.randint(0, 100000))


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    rows = load_jsonl(args.dataset)
    done = reviewed_shas(args.reviewed)

    candidates = [
        row
        for row in rows
        if (row["repo"], row["sha"]) not in done and row["label"] in PRIORITY_LABELS
    ]
    ranked = sorted(candidates, key=priority_score, reverse=True)
    selected = ranked[: args.target_total]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("", encoding="utf-8")
    for row in selected:
        append_jsonl(args.output, row)

    counts: dict[str, int] = Counter(row["label"] for row in selected)
    print(f"Wrote {len(selected)} focus review items to {args.output}")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    from collections import Counter

    main()
