from __future__ import annotations

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge multiple JSONL datasets into one file.")
    parser.add_argument("--inputs", nargs="+", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with args.output.open("w", encoding="utf-8") as handle:
        for input_path in args.inputs:
            if not input_path.exists():
                continue
            for raw_line in input_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                handle.write(line + "\n")
                written += 1

    print(f"Merged {written} rows into {args.output}")


if __name__ == "__main__":
    main()
