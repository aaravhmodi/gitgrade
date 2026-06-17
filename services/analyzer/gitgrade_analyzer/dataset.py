import json
from pathlib import Path

from pydantic import BaseModel

from .models import CommitFeatures


class LabeledCommit(BaseModel):
    repo: str
    label: str
    features: CommitFeatures


def load_labeled_commits(path: str | Path) -> list[LabeledCommit]:
    dataset_path = Path(path)
    records: list[LabeledCommit] = []

    with dataset_path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue

            payload = json.loads(line)
            label = payload.pop("label")
            repo = payload.pop("repo")
            records.append(
                LabeledCommit(
                    repo=repo,
                    label=label,
                    features=CommitFeatures(**payload),
                )
            )

    if not records:
        raise ValueError(f"No labeled commits found in {dataset_path}")

    return records
