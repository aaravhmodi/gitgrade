from __future__ import annotations

import argparse
from pathlib import Path

from gitgrade_analyzer.dataset import load_labeled_commits
from gitgrade_analyzer.training import train_classifier


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the baseline GitGrade commit classifier.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("../../datasets/seed_open_source_commits.jsonl"),
        help="Path to a labeled JSONL dataset of commits.",
    )
    parser.add_argument(
        "--reviews",
        type=Path,
        default=Path("../../datasets/reviews/manual_labels.jsonl"),
        help="Optional JSONL manual-review overrides.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    review_path = args.reviews if args.reviews.exists() else None
    records = load_labeled_commits(args.dataset, review_path=review_path)
    artifacts = train_classifier(records)

    print(f"Trained baseline classifier on {artifacts.sample_count} labeled commits.")
    print(f"Labels: {', '.join(artifacts.labels)}")
    print("Features:")
    for feature_name in artifacts.feature_names:
        print(f"- {feature_name}")
    print()
    print("Evaluation:")
    print(artifacts.metrics_text)


if __name__ == "__main__":
    main()
