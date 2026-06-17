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
    vague_message: bool = False
    issue_reference: bool = False
    tiny_diff: bool = False
    whitespace_only: bool = False
    repeated_message: bool = False


class CommitReport(BaseModel):
    sha: str
    message: str
    score: int = Field(ge=0, le=100)
    category: str
    rationale: list[str]


class RepositorySummary(BaseModel):
    overall_grade: str
    average_commit_score: float
    meaningful_commit_ratio: float
    impact_per_commit: float
    commit_inflation_ratio: float
    padding_risk: str


class RepositoryReport(BaseModel):
    repository: str
    summary: RepositorySummary
    commits: list[CommitReport]


def top_meaningful_ratio(commits: Sequence[CommitReport]) -> float:
    if not commits:
        return 0.0

    meaningful = sum(1 for commit in commits if commit.score >= 60)
    return meaningful / len(commits)
