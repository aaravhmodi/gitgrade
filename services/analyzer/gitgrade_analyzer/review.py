from __future__ import annotations

import json
from pathlib import Path
from typing import Any

LABEL_KEYS = {
    "1": "noise",
    "2": "low_value",
    "3": "medium_value",
    "4": "high_value",
}


def load_jsonl(path: str | Path) -> list[dict[str, Any]]:
    target = Path(path)
    if not target.exists():
        return []

    rows: list[dict[str, Any]] = []
    with target.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def append_jsonl(path: str | Path, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")


def reviewed_shas(path: str | Path) -> set[tuple[str, str]]:
    return {
        (row["repo"], row["sha"])
        for row in load_jsonl(path)
        if "repo" in row and "sha" in row
    }
