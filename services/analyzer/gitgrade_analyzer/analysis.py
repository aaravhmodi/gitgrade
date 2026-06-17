from __future__ import annotations

from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

from .dataset import load_labeled_commits
from .github_client import GithubClient, GithubCommitSource
from .ingestion import commit_features_from_github_detail
from .models import (
    AnalysisSummary,
    CommitFeatures,
    CommitPrediction,
    GitGradeReport,
)
from .training import TrainingArtifacts, fit_full_classifier, predict_probabilities

LABEL_WEIGHTS = {
    "noise": 0.0,
    "low_value": 0.25,
    "medium_value": 0.65,
    "high_value": 1.0,
}

DEFAULT_DATASET = Path(__file__).resolve().parents[3] / "datasets" / "training_combined_with_local.jsonl"
DEFAULT_REVIEWS = Path(__file__).resolve().parents[3] / "datasets" / "reviews" / "manual_labels.jsonl"


def _file_mix(features: CommitFeatures) -> dict[str, int]:
    return {
        "source": features.source_files_changed,
        "test": features.test_files_changed,
        "docs": features.docs_files_changed,
        "config": features.config_files_changed,
        "generated": features.generated_files_changed,
        "data": features.data_files_changed,
        "assets": features.asset_files_changed,
        "core": features.core_files_changed,
    }


def _deterministic_impact(features: CommitFeatures) -> tuple[float, list[str]]:
    total_change = features.lines_added + features.lines_deleted
    rationale: list[str] = []
    score = 0.0

    source_impact = min(0.42, features.source_files_changed * 0.06)
    if source_impact:
        score += source_impact
        rationale.append("Touches source code.")

    core_impact = min(0.18, features.core_files_changed * 0.04)
    if core_impact:
        score += core_impact
        rationale.append("Touches core project areas.")

    if features.test_files_changed:
        score += min(0.16, features.test_files_changed * 0.05)
        rationale.append("Includes test changes.")

    if total_change >= 120:
        score += 0.12
        rationale.append("Shows substantial implementation depth.")
    elif total_change >= 30:
        score += 0.06

    if features.source_files_changed >= 3 and features.files_changed >= 4:
        score += 0.08
        rationale.append("Multi-file change suggests coherent feature or fix work.")

    if features.source_files_changed and features.test_files_changed:
        score += 0.06

    if features.data_files_changed:
        penalty = min(0.18, features.data_files_changed * 0.05)
        score -= penalty
        rationale.append("Includes data-file churn, which counts less toward engineering signal.")

    if features.asset_files_changed:
        penalty = min(0.12, features.asset_files_changed * 0.04)
        score -= penalty
        rationale.append("Includes asset-heavy changes, which count less toward engineering signal.")

    if features.generated_files_changed:
        penalty = min(0.2, features.generated_files_changed * 0.06)
        score -= penalty
        rationale.append("Generated or lockfile changes are discounted.")

    if features.docs_files_changed and not features.source_files_changed:
        score -= 0.08
        rationale.append("Docs-only changes are lower-signal than source changes.")

    if features.config_files_changed and not features.source_files_changed and total_change <= 20:
        score -= 0.08
        rationale.append("Small config/build-only changes are lower-signal.")

    if features.files_changed == 1 and total_change <= 5:
        score -= 0.14
        rationale.append("Tiny single-file change lowers the engineering signal.")

    if features.whitespace_only:
        score -= 0.22
        rationale.append("Formatting-only change lowers the score.")

    if features.tiny_diff:
        score -= 0.08

    return max(0.0, min(1.0, score)), rationale


def _weighted_score_to_grade(score: float) -> str:
    if score >= 0.9:
        return "A+"
    if score >= 0.84:
        return "A"
    if score >= 0.78:
        return "A-"
    if score >= 0.72:
        return "B+"
    if score >= 0.66:
        return "B"
    if score >= 0.6:
        return "B-"
    if score >= 0.54:
        return "C+"
    if score >= 0.48:
        return "C"
    if score >= 0.42:
        return "C-"
    return "Needs stronger signal"


@lru_cache(maxsize=1)
def get_trained_artifacts(
    dataset_path: str | None = None,
    review_path: str | None = None,
) -> TrainingArtifacts:
    dataset = Path(dataset_path) if dataset_path else DEFAULT_DATASET
    reviews = Path(review_path) if review_path else DEFAULT_REVIEWS
    resolved_reviews = reviews if reviews.exists() else None
    records = load_labeled_commits(dataset, review_path=resolved_reviews)
    return fit_full_classifier(records)


def predict_commit(features: CommitFeatures, artifacts: TrainingArtifacts) -> CommitPrediction:
    probabilities = predict_probabilities(artifacts, [features])[0]
    predicted_label = max(probabilities, key=probabilities.get)
    confidence = probabilities[predicted_label]
    deterministic_impact, rationale = _deterministic_impact(features)
    weighted_impact = max(
        0.0,
        min(1.0, deterministic_impact * 0.55 + LABEL_WEIGHTS[predicted_label] * 0.35 + confidence * 0.1),
    )
    score = round(weighted_impact * 100)

    return CommitPrediction(
        sha=features.sha,
        message=features.message,
        predicted_label=predicted_label,
        score=score,
        weighted_impact=round(weighted_impact, 3),
        confidence=round(confidence, 3),
        file_mix=_file_mix(features),
        rationale=rationale[:4] or ["Predicted from commit structure and file impact."],
    )


def aggregate_report(subject_type: str, subject_name: str, predictions: list[CommitPrediction]) -> GitGradeReport:
    if not predictions:
        empty_summary = AnalysisSummary(
            overall_grade="Needs stronger signal",
            overall_score=0.0,
            average_commit_score=0.0,
            meaningful_commit_ratio=0.0,
            impact_per_commit=0.0,
            commit_inflation_ratio=0.0,
            padding_risk="Unknown",
            total_commits=0,
            meaningful_commits=0,
            file_type_breakdown={},
            commit_label_breakdown={},
            weak_signal_patterns=["No commits available for analysis."],
            strongest_signal="No visible signal.",
            weakest_signal="No visible signal.",
        )
        return GitGradeReport(subject_type=subject_type, subject_name=subject_name, summary=empty_summary, commits=[], top_commits=[])

    total_commits = len(predictions)
    meaningful_commits = sum(1 for item in predictions if item.predicted_label in {"medium_value", "high_value"})
    label_counts = Counter(item.predicted_label for item in predictions)
    average_commit_score = sum(item.score for item in predictions) / total_commits
    weighted_score = sum(item.weighted_impact for item in predictions) / total_commits
    meaningful_ratio = meaningful_commits / total_commits
    inflation_ratio = total_commits / max(1, meaningful_commits)

    file_breakdown: dict[str, int] = defaultdict(int)
    for prediction in predictions:
        for key, value in prediction.file_mix.items():
            file_breakdown[key] += value

    weak_patterns: list[str] = []
    if label_counts["noise"] / total_commits >= 0.18:
        weak_patterns.append("High share of noise-level commits.")
    if label_counts["low_value"] / total_commits >= 0.45:
        weak_patterns.append("Large concentration of low-value maintenance commits.")
    tiny_commit_count = sum(1 for item in predictions if item.score <= 20)
    if tiny_commit_count / total_commits >= 0.15:
        weak_patterns.append("Many tiny low-impact commits.")
    if file_breakdown["data"] + file_breakdown["generated"] + file_breakdown["assets"] > file_breakdown["source"]:
        weak_patterns.append("Non-code file churn outweighs source-code impact.")

    strongest_signal = max(label_counts, key=lambda label: (LABEL_WEIGHTS[label], label_counts[label]))
    weakest_signal = min(label_counts, key=lambda label: (LABEL_WEIGHTS[label], -label_counts[label]))

    summary = AnalysisSummary(
        overall_grade=_weighted_score_to_grade(weighted_score),
        overall_score=round(weighted_score * 100, 1),
        average_commit_score=round(average_commit_score, 1),
        meaningful_commit_ratio=round(meaningful_ratio, 3),
        impact_per_commit=round(weighted_score * 100, 1),
        commit_inflation_ratio=round(inflation_ratio, 2),
        padding_risk="High" if inflation_ratio >= 3.5 else "Medium" if inflation_ratio >= 2.0 else "Low",
        total_commits=total_commits,
        meaningful_commits=meaningful_commits,
        file_type_breakdown=dict(file_breakdown),
        commit_label_breakdown=dict(label_counts),
        weak_signal_patterns=weak_patterns or ["No dominant low-signal pattern detected."],
        strongest_signal=strongest_signal,
        weakest_signal=weakest_signal,
    )

    sorted_predictions = sorted(predictions, key=lambda item: (item.weighted_impact, item.confidence), reverse=True)
    return GitGradeReport(
        subject_type=subject_type,
        subject_name=subject_name,
        summary=summary,
        commits=sorted_predictions,
        top_commits=sorted_predictions[:5],
    )


def analyze_commit_features(subject_type: str, subject_name: str, features: list[CommitFeatures]) -> GitGradeReport:
    artifacts = get_trained_artifacts()
    predictions = [predict_commit(item, artifacts) for item in features]
    return aggregate_report(subject_type, subject_name, predictions)


def analyze_repo(repo_slug: str, commit_limit: int, client: GithubClient | None = None) -> GitGradeReport:
    github = client or GithubClient()
    owner, repo = repo_slug.split("/", maxsplit=1)
    source = GithubCommitSource(owner=owner, repo=repo)
    commit_refs = github.fetch_recent_commits(source, limit=commit_limit)
    features: list[CommitFeatures] = []
    for commit_ref in commit_refs:
        detail = github.fetch_commit_detail(source, commit_ref["sha"])
        features.append(commit_features_from_github_detail(detail))
    return analyze_commit_features("repository", repo_slug, features)


def analyze_user(
    username: str,
    repo_limit: int,
    commits_per_repo: int,
    selected_repo_slugs: list[str] | None = None,
    client: GithubClient | None = None,
) -> GitGradeReport:
    github = client or GithubClient()
    selected_repo_slugs = selected_repo_slugs or []

    if selected_repo_slugs:
        selected_repos = [
            {"full_name": repo_slug}
            for repo_slug in selected_repo_slugs[:50]
        ]
    else:
        repos = github.fetch_user_repositories(username, per_page=min(repo_limit, 100))
        selected_repos = [repo for repo in repos if not repo.get("fork")][:repo_limit]

    features: list[CommitFeatures] = []

    for repo in selected_repos:
        owner, repo_name = repo["full_name"].split("/", maxsplit=1)
        source = GithubCommitSource(owner=owner, repo=repo_name)
        commit_refs = github.fetch_recent_commits(source, limit=commits_per_repo)
        for commit_ref in commit_refs:
            commit_author = commit_ref.get("author") or {}
            if commit_author.get("login", "").lower() != username.lower():
                continue
            detail = github.fetch_commit_detail(source, commit_ref["sha"])
            features.append(commit_features_from_github_detail(detail))

    return analyze_commit_features("user", username, features)
