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
]


def _ratio(value: int, total: int) -> float:
    return value / total if total else 0.0


def feature_vector(features: CommitFeatures) -> dict[str, float]:
    total_line_change = features.lines_added + features.lines_deleted

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
    }


def matrix_from_features(items: list[CommitFeatures]) -> list[list[float]]:
    rows: list[list[float]] = []
    for item in items:
        vector = feature_vector(item)
        rows.append([vector[name] for name in MODEL_FEATURE_NAMES])
    return rows
