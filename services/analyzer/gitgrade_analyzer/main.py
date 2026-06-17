from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI

from .analysis import analyze_commit_features, analyze_repo, analyze_user
from .models import AnalyzeRepoRequest, AnalyzeUserRequest, CommitFeatures, GitGradeReport

app = FastAPI(title="GitGrade Analyzer", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/sample-report", response_model=GitGradeReport)
def sample_report() -> GitGradeReport:
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
            core_files_changed=6,
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
    return analyze_commit_features("repository", "owner/repo", sample_commits)


@app.post("/analyze/repo", response_model=GitGradeReport)
def analyze_repo_endpoint(payload: AnalyzeRepoRequest) -> GitGradeReport:
    return analyze_repo(payload.repo, payload.commit_limit)


@app.post("/analyze/user", response_model=GitGradeReport)
def analyze_user_endpoint(payload: AnalyzeUserRequest) -> GitGradeReport:
    return analyze_user(payload.username, payload.repo_limit, payload.commits_per_repo)
