import re

from .models import CommitFeatures

MODEL_FEATURE_NAMES = [
    "files_changed",
    "lines_added",
    "lines_deleted",
    "net_line_change",
    "total_line_change",
    "source_files_changed",
    "test_files_changed",
    "docs_files_changed",
    "generated_files_changed",
    "config_files_changed",
    "source_file_ratio",
    "test_file_ratio",
    "docs_file_ratio",
    "generated_file_ratio",
    "config_file_ratio",
    "message_word_count",
    "has_specific_message",
    "issue_reference",
    "tiny_diff",
    "whitespace_only",
    "repeated_message",
    "vague_message",
    "single_file_commit",
    "very_small_change",
    "small_change",
    "large_change",
    "avg_lines_per_file",
    "source_only",
    "test_only",
    "docs_only",
    "generated_only",
    "config_only",
    "source_and_test_pair",
    "no_source_code",
    "message_type_feat",
    "message_type_fix",
    "message_type_refactor",
    "message_type_perf",
    "message_type_test",
    "message_type_docs",
    "message_type_build",
    "message_type_chore",
    "message_type_style",
    "version_bump_like",
    "release_like",
    "dependency_like",
    "comment_or_docs_heavy",
]


def _ratio(value: int, total: int) -> float:
    return value / total if total else 0.0


def _message_type(message: str) -> str:
    normalized = message.strip().lower()
    match = re.match(r"^([a-z]+)(\(.+\))?:", normalized)
    if match:
        return match.group(1)

    first_word = normalized.split(maxsplit=1)[0] if normalized else ""
    return first_word


def _has_any(text: str, needles: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def feature_vector(features: CommitFeatures) -> dict[str, float]:
    total_line_change = features.lines_added + features.lines_deleted
    message_type = _message_type(features.message)
    non_source_files = (
        features.test_files_changed
        + features.docs_files_changed
        + features.generated_files_changed
        + features.config_files_changed
    )

    return {
        "files_changed": float(features.files_changed),
        "lines_added": float(features.lines_added),
        "lines_deleted": float(features.lines_deleted),
        "net_line_change": float(features.lines_added - features.lines_deleted),
        "total_line_change": float(total_line_change),
        "source_files_changed": float(features.source_files_changed),
        "test_files_changed": float(features.test_files_changed),
        "docs_files_changed": float(features.docs_files_changed),
        "generated_files_changed": float(features.generated_files_changed),
        "config_files_changed": float(features.config_files_changed),
        "source_file_ratio": _ratio(features.source_files_changed, features.files_changed),
        "test_file_ratio": _ratio(features.test_files_changed, features.files_changed),
        "docs_file_ratio": _ratio(features.docs_files_changed, features.files_changed),
        "generated_file_ratio": _ratio(features.generated_files_changed, features.files_changed),
        "config_file_ratio": _ratio(features.config_files_changed, features.files_changed),
        "message_word_count": float(len(features.message.split())),
        "has_specific_message": 0.0 if features.vague_message else 1.0,
        "issue_reference": float(features.issue_reference),
        "tiny_diff": float(features.tiny_diff),
        "whitespace_only": float(features.whitespace_only),
        "repeated_message": float(features.repeated_message),
        "vague_message": float(features.vague_message),
        "single_file_commit": float(features.files_changed == 1),
        "very_small_change": float(total_line_change <= 6),
        "small_change": float(total_line_change <= 20),
        "large_change": float(total_line_change >= 120),
        "avg_lines_per_file": _ratio(total_line_change, features.files_changed),
        "source_only": float(features.source_files_changed > 0 and non_source_files == 0),
        "test_only": float(features.test_files_changed > 0 and features.source_files_changed == 0 and non_source_files == features.test_files_changed),
        "docs_only": float(features.docs_files_changed > 0 and features.source_files_changed == 0 and non_source_files == features.docs_files_changed),
        "generated_only": float(features.generated_files_changed > 0 and features.source_files_changed == 0 and non_source_files == features.generated_files_changed),
        "config_only": float(features.config_files_changed > 0 and features.source_files_changed == 0 and non_source_files == features.config_files_changed),
        "source_and_test_pair": float(features.source_files_changed > 0 and features.test_files_changed > 0),
        "no_source_code": float(features.source_files_changed == 0),
        "message_type_feat": float(message_type == "feat"),
        "message_type_fix": float(message_type == "fix"),
        "message_type_refactor": float(message_type == "refactor"),
        "message_type_perf": float(message_type == "perf"),
        "message_type_test": float(message_type == "test"),
        "message_type_docs": float(message_type == "docs"),
        "message_type_build": float(message_type == "build"),
        "message_type_chore": float(message_type == "chore"),
        "message_type_style": float(message_type == "style"),
        "version_bump_like": float(_has_any(features.message, ("bump", "version", "release"))),
        "release_like": float(_has_any(features.message, ("release", "rc", "[skip ci]"))),
        "dependency_like": float(_has_any(features.message, ("dependency", "dependencies", "deps", "lockfile", "package manager"))),
        "comment_or_docs_heavy": float(features.docs_files_changed > 0 and features.source_files_changed == 0 and total_line_change <= 20),
    }


def matrix_from_features(items: list[CommitFeatures]) -> list[list[float]]:
    rows: list[list[float]] = []
    for item in items:
        vector = feature_vector(item)
        rows.append([vector[name] for name in MODEL_FEATURE_NAMES])
    return rows
