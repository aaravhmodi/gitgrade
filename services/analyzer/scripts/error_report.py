from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from _bootstrap import ensure_project_root

ensure_project_root()

from gitgrade_analyzer.dataset import load_labeled_commits
from gitgrade_analyzer.review import load_jsonl
from gitgrade_analyzer.training import fit_full_classifier, predict_labels


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Show model mistakes on manually reviewed commits.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("../../datasets/training_combined_with_local.jsonl"),
    )
    parser.add_argument(
        "--reviews",
        type=Path,
        default=Path("../../datasets/reviews/manual_labels.jsonl"),
    )
    parser.add_argument("--limit", type=int, default=25)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    review_rows = load_jsonl(args.reviews)
    if not review_rows:
        print("No manual reviews found.")
        return

    review_lookup = {
        (row["repo"], row["sha"]): row
        for row in review_rows
        if "repo" in row and "sha" in row and "final_label" in row
    }

    records = load_labeled_commits(args.dataset, review_path=args.reviews)
    artifacts = fit_full_classifier(records)

    reviewed_records = [
        record for record in records if (record.repo, record.features.sha) in review_lookup
    ]
    if not reviewed_records:
        print("No reviewed commits overlap with the dataset.")
        return

    predictions = predict_labels(artifacts, [record.features for record in reviewed_records])
    mismatches: list[dict[str, str | int]] = []

    for record, predicted in zip(reviewed_records, predictions, strict=True):
        review = review_lookup[(record.repo, record.features.sha)]
        final_label = review["final_label"]
        if predicted == final_label:
            continue

        mismatches.append(
            {
                "repo": record.repo,
                "sha": record.features.sha,
                "message": record.features.message,
                "weak_label": review.get("weak_label", ""),
                "final_label": final_label,
                "predicted_label": predicted,
                "files_changed": record.features.files_changed,
                "total_change": record.features.lines_added + record.features.lines_deleted,
                "notes": review.get("notes", ""),
            }
        )

    print(f"Reviewed commits: {len(reviewed_records)}")
    print(f"Mismatches: {len(mismatches)}")
    if mismatches:
        pair_counts = Counter(
            f"{item['final_label']} -> {item['predicted_label']}" for item in mismatches
        )
        print("Mismatch summary:")
        for pair, count in pair_counts.most_common():
            print(f"- {pair}: {count}")

        print()
        print("Examples:")
        for item in mismatches[: args.limit]:
            print(json.dumps(item, ensure_ascii=True))


if __name__ == "__main__":
    main()
