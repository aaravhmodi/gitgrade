from collections import Counter
from dataclasses import dataclass

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from .dataset import LabeledCommit
from .feature_engineering import MODEL_FEATURE_NAMES, matrix_from_features

LABEL_ORDER = ["noise", "low_value", "medium_value", "high_value"]


@dataclass(slots=True)
class TrainingArtifacts:
    model: RandomForestClassifier
    labels: list[str]
    feature_names: list[str]
    metrics_text: str
    sample_count: int


def train_classifier(records: list[LabeledCommit]) -> TrainingArtifacts:
    features = [record.features for record in records]
    labels = [record.label for record in records]
    matrix = matrix_from_features(features)

    if len(set(labels)) < 2:
        raise ValueError("Training data must contain at least two labels.")

    stratify = labels if min(Counter(labels).values()) >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        matrix,
        labels,
        test_size=0.25,
        random_state=42,
        stratify=stratify,
    )

    model = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
        max_depth=8,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    present_labels = [label for label in LABEL_ORDER if label in set(labels)]
    metrics_text = classification_report(
        y_test,
        predictions,
        labels=present_labels,
        zero_division=0,
    )

    return TrainingArtifacts(
        model=model,
        labels=present_labels,
        feature_names=list(MODEL_FEATURE_NAMES),
        metrics_text=metrics_text,
        sample_count=len(records),
    )
