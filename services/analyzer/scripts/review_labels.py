from __future__ import annotations

import argparse
from pathlib import Path

from gitgrade_analyzer.review import LABEL_KEYS, append_jsonl, load_jsonl, reviewed_shas


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Review commit labels in the terminal.")
    parser.add_argument(
        "--queue",
        type=Path,
        default=Path("../../datasets/reviews/review_queue.jsonl"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../datasets/reviews/manual_labels.jsonl"),
    )
    parser.add_argument("--reviewer", type=str, default="local-reviewer")
    return parser.parse_args()


def render_item(index: int, total: int, row: dict) -> None:
    print()
    print(f"[{index}/{total}] {row['repo']} {row['sha']}")
    print(f"Weak label: {row['label']}")
    print(f"Message: {row['message']}")
    print(
        "Files/Lines: "
        f"{row['files_changed']} files, +{row['lines_added']} -{row['lines_deleted']}"
    )
    print(
        "Mix: "
        f"src={row['source_files_changed']} "
        f"test={row['test_files_changed']} "
        f"docs={row['docs_files_changed']} "
        f"gen={row['generated_files_changed']} "
        f"cfg={row['config_files_changed']}"
    )
    print("Labels: 1=noise 2=low_value 3=medium_value 4=high_value s=skip q=quit")


def main() -> None:
    args = parse_args()
    queue = load_jsonl(args.queue)
    done = reviewed_shas(args.output)

    remaining = [row for row in queue if (row["repo"], row["sha"]) not in done]
    total = len(remaining)
    if not remaining:
        print("No review items remaining.")
        return

    for index, row in enumerate(remaining, start=1):
        render_item(index, total, row)
        choice = input("Choice: ").strip().lower()

        if choice == "q":
            print("Stopped review session.")
            return
        if choice == "s":
            continue
        if choice not in LABEL_KEYS:
            print("Invalid choice, skipping.")
            continue

        notes = input("Notes (optional): ").strip()
        append_jsonl(
            args.output,
            {
                "repo": row["repo"],
                "sha": row["sha"],
                "weak_label": row["label"],
                "final_label": LABEL_KEYS[choice],
                "reviewer": args.reviewer,
                "notes": notes,
            },
        )

    print("Review queue complete.")


if __name__ == "__main__":
    main()
