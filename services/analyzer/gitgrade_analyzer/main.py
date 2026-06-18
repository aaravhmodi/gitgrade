from dotenv import load_dotenv
load_dotenv()

import logging
import os
from contextlib import asynccontextmanager

import posthog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .analysis import analyze_commit_features, analyze_repo, analyze_user
from .github_client import GithubApiError, GithubClient
from .models import AnalyzeRepoRequest, AnalyzeUserRequest, CommitFeatures, GitGradeReport

logging.basicConfig(level=logging.INFO)

posthog.api_key = os.environ.get("POSTHOG_API_KEY", "")
posthog.host = os.environ.get("POSTHOG_HOST", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    posthog.shutdown()


app = FastAPI(title="GitGrade Analyzer", version="0.1.0", lifespan=lifespan)


@app.exception_handler(GithubApiError)
def github_api_error_handler(_: Request, exc: GithubApiError) -> JSONResponse:
    status = exc.status_code if exc.status_code in {401, 403, 404, 422, 429} else 502
    return JSONResponse(status_code=status, content={"error": exc.message})


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
    report = analyze_commit_features("repository", "owner/repo", sample_commits)
    posthog.capture(
        "anonymous",
        "sample_report_viewed",
        {"grade": report.grade, "score": report.score},
    )
    return report


@app.post("/analyze/repo", response_model=GitGradeReport)
def analyze_repo_endpoint(payload: AnalyzeRepoRequest) -> GitGradeReport:
    report = analyze_repo(payload.repo, payload.commit_limit)
    posthog.capture(
        "anonymous",
        "repo_analyzed",
        {"repo": payload.repo, "grade": report.grade, "score": report.score},
    )
    return report


@app.post("/analyze/user", response_model=GitGradeReport)
def analyze_user_endpoint(payload: AnalyzeUserRequest) -> GitGradeReport:
    client = GithubClient(token=payload.github_token) if payload.github_token else None

    report = analyze_user(
        payload.username,
        payload.repo_limit,
        payload.commits_per_repo,
        selected_repo_slugs=payload.selected_repos,
        client=client,
    )
    posthog.capture(
        "anonymous",
        "user_analyzed",
        {"username": payload.username, "grade": report.grade, "score": report.score},
    )
    return report
