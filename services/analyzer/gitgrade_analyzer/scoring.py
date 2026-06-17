from statistics import mean

from .models import CommitFeatures, CommitReport, RepositoryReport, RepositorySummary, top_meaningful_ratio


def _grade_from_average(average_score: float) -> str:
    if average_score >= 90:
        return "A+"
    if average_score >= 85:
        return "A"
    if average_score >= 80:
        return "A-"
    if average_score >= 75:
        return "B+"
    if average_score >= 70:
        return "B"
    if average_score >= 65:
        return "B-"
    if average_score >= 60:
        return "C+"
    if average_score >= 55:
        return "C"
    if average_score >= 50:
        return "C-"
    return "Needs stronger signal"


def score_commit(features: CommitFeatures) -> CommitReport:
    score = 35
    rationale: list[str] = []

    if features.source_files_changed:
        score += min(25, features.source_files_changed * 6)
        rationale.append("Touches source code.")

    if features.test_files_changed:
        score += min(15, features.test_files_changed * 5)
        rationale.append("Includes test impact.")

    if features.config_files_changed and not features.source_files_changed:
        score += 5
        rationale.append("Includes build or configuration changes.")

    if len(features.message.split()) >= 4 and not features.vague_message:
        score += 10
        rationale.append("Commit message is specific enough to infer intent.")

    if features.issue_reference:
        score += 5
        rationale.append("Includes issue or PR context.")

    if features.lines_added + features.lines_deleted >= 80 and features.source_files_changed >= 2:
        score += 10
        rationale.append("Shows meaningful implementation depth.")

    if features.generated_files_changed and not features.source_files_changed:
        score -= 20
        rationale.append("Mostly generated or lockfile-related changes.")

    if features.whitespace_only:
        score -= 25
        rationale.append("Change appears to be formatting-only.")

    if features.tiny_diff and features.vague_message:
        score -= 18
        rationale.append("Tiny diff with vague intent.")

    if features.repeated_message:
        score -= 10
        rationale.append("Message pattern suggests low-information activity.")

    score = max(0, min(100, score))

    if score >= 80:
        category = "high_impact_feature"
    elif score >= 60:
        category = "useful_change"
    elif score >= 40:
        category = "minor_change"
    else:
        category = "low_signal"

    if not rationale:
        rationale.append("Insufficient signal beyond diff statistics.")

    return CommitReport(
        sha=features.sha,
        message=features.message,
        score=score,
        category=category,
        rationale=rationale,
    )


def summarize_repository(repository: str, commit_features: list[CommitFeatures]) -> RepositoryReport:
    commit_reports = [score_commit(features) for features in commit_features]
    average_score = mean(commit.score for commit in commit_reports) if commit_reports else 0.0
    meaningful_ratio = top_meaningful_ratio(commit_reports)
    meaningful_commits = max(1, sum(1 for commit in commit_reports if commit.score >= 60))
    inflation_ratio = len(commit_reports) / meaningful_commits if commit_reports else 0.0

    padding_risk = "High" if inflation_ratio >= 3.5 else "Medium" if inflation_ratio >= 2.0 else "Low"

    return RepositoryReport(
        repository=repository,
        summary=RepositorySummary(
            overall_grade=_grade_from_average(average_score),
            average_commit_score=round(average_score, 1),
            meaningful_commit_ratio=round(meaningful_ratio, 3),
            impact_per_commit=round(average_score, 1),
            commit_inflation_ratio=round(inflation_ratio, 2),
            padding_risk=padding_risk,
        ),
        commits=commit_reports,
    )
