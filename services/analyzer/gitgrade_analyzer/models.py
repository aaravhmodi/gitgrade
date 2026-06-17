from collections.abc import Sequence

from pydantic import BaseModel, Field


class CommitFeatures(BaseModel):
    sha: str
    message: str
    files_changed: int = Field(ge=0)
    lines_added: int = Field(ge=0)
    lines_deleted: int = Field(ge=0)
    source_files_changed: int = Field(default=0, ge=0)
    test_files_changed: int = Field(default=0, ge=0)
    docs_files_changed: int = Field(default=0, ge=0)
    generated_files_changed: int = Field(default=0, ge=0)
    config_files_changed: int = Field(default=0, ge=0)
    data_files_changed: int = Field(default=0, ge=0)
    asset_files_changed: int = Field(default=0, ge=0)
    core_files_changed: int = Field(default=0, ge=0)
    vague_message: bool = False
    issue_reference: bool = False
    tiny_diff: bool = False
    whitespace_only: bool = False
    repeated_message: bool = False


class CommitPrediction(BaseModel):
    sha: str
    message: str
    predicted_label: str
    score: int = Field(ge=0, le=100)
    weighted_impact: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    file_mix: dict[str, int]
    rationale: list[str]


class AnalysisSummary(BaseModel):
    overall_grade: str
    overall_score: float
    average_commit_score: float
    meaningful_commit_ratio: float
    impact_per_commit: float
    commit_inflation_ratio: float
    padding_risk: str
    total_commits: int
    meaningful_commits: int
    file_type_breakdown: dict[str, int]
    commit_label_breakdown: dict[str, int]
    weak_signal_patterns: list[str]
    strongest_signal: str
    weakest_signal: str


class GitGradeReport(BaseModel):
    subject_type: str
    subject_name: str
    summary: AnalysisSummary
    commits: list[CommitPrediction]
    top_commits: list[CommitPrediction]


class AnalyzeRepoRequest(BaseModel):
    repo: str
    commit_limit: int = Field(default=50, ge=1, le=200)


class AnalyzeUserRequest(BaseModel):
    username: str
    selected_repos: list[str] = Field(default_factory=list, max_length=50)
    repo_limit: int = Field(default=6, ge=1, le=20)
    commits_per_repo: int = Field(default=40, ge=1, le=150)
    github_token: str | None = None


def top_meaningful_ratio(commits: Sequence[CommitPrediction]) -> float:
    if not commits:
        return 0.0

    meaningful = sum(1 for commit in commits if commit.predicted_label in {"medium_value", "high_value"})
    return meaningful / len(commits)
