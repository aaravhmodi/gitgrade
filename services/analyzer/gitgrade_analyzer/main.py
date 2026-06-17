from fastapi import FastAPI

from .models import CommitFeatures, RepositoryReport
from .scoring import summarize_repository

app = FastAPI(title="GitGrade Analyzer", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/sample-report", response_model=RepositoryReport)
def sample_report() -> RepositoryReport:
    sample_commits = [
        CommitFeatures(
            sha="abc1234",
            message="Add authentication flow and session tests",
            files_changed=7,
            lines_added=820,
            lines_deleted=45,
            source_files_changed=5,
            test_files_changed=1,
            config_files_changed=1,
            issue_reference=True,
        ),
        CommitFeatures(
            sha="def5678",
            message="update",
            files_changed=1,
            lines_added=1,
            lines_deleted=1,
            docs_files_changed=1,
            vague_message=True,
            tiny_diff=True,
        ),
    ]
    return summarize_repository("owner/repo", sample_commits)
