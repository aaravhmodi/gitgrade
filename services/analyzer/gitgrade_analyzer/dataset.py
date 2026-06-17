import json
from pathlib import Path

from pydantic import BaseModel

from .models import CommitFeatures
from .review import load_jsonl


class LabeledCommit(BaseModel):
    repo: str
    label: str
    features: CommitFeatures


def _review_overrides(path: str | Path | None) -> dict[tuple[str, str], str]:
    if path is None:
        return {}

    overrides: dict[tuple[str, str], str] = {}
    for row in load_jsonl(path):
        repo = row.get("repo")
        sha = row.get("sha")
        final_label = row.get("final_label")
        if repo and sha and final_label:
            overrides[(repo, sha)] = final_label
    return overrides


def load_labeled_commits(path: str | Path, review_path: str | Path | None = None) -> list[LabeledCommit]:
    dataset_path = Path(path)
    records: list[LabeledCommit] = []
    overrides = _review_overrides(review_path)

    with dataset_path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue

            payload = json.loads(line)
            label = payload.pop("label")
            repo = payload.pop("repo")
            sha = payload["sha"]
            records.append(
                LabeledCommit(
                    repo=repo,
                    label=overrides.get((repo, sha), label),
                    features=CommitFeatures(**payload),
                )
            )

    if not records:
        raise ValueError(f"No labeled commits found in {dataset_path}")

    return records
