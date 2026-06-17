from pydantic import BaseModel, Field

from .models import CommitFeatures


class HeuristicCommitScore(BaseModel):
    sha: str
    message: str
    score: int = Field(ge=0, le=100)
    category: str
    rationale: list[str]


def score_commit(features: CommitFeatures) -> HeuristicCommitScore:
    score = 35
    rationale: list[str] = []

    if features.source_files_changed:
        score += min(25, features.source_files_changed * 6)
        rationale.append("Touches source code.")

    if features.core_files_changed:
        score += min(10, features.core_files_changed * 2)
        rationale.append("Touches core project paths.")

    if features.test_files_changed:
        score += min(15, features.test_files_changed * 5)
        rationale.append("Includes test impact.")

    if features.config_files_changed and not features.source_files_changed:
        score += 5
        rationale.append("Includes build or configuration changes.")

    if len(features.message.split()) >= 4 and not features.vague_message:
        score += 8
        rationale.append("Commit message is specific enough to infer intent.")

    if features.issue_reference:
        score += 5
        rationale.append("Includes issue or PR context.")

    if features.lines_added + features.lines_deleted >= 80 and features.source_files_changed >= 2:
        score += 10
        rationale.append("Shows meaningful implementation depth.")

    if features.data_files_changed or features.asset_files_changed:
        score -= min(12, (features.data_files_changed + features.asset_files_changed) * 4)
        rationale.append("Data or asset churn counts less toward engineering signal.")

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

    return HeuristicCommitScore(
        sha=features.sha,
        message=features.message,
        score=score,
        category=category,
        rationale=rationale,
    )
