from dotenv import load_dotenv
load_dotenv()

import json
import logging
import os
from contextlib import asynccontextmanager

import posthog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .cache import RedisCache, build_cache_key
from .analysis import analyze_commit_features, analyze_repo, analyze_user
from .github_client import GithubApiError, GithubClient
from .models import AnalyzeRepoRequest, AnalyzeUserRequest, CommitFeatures, GitGradeReport

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

posthog.api_key = os.environ.get("POSTHOG_API_KEY", "")
posthog.host = os.environ.get("POSTHOG_HOST", "")
redis_cache = RedisCache.from_env()
analysis_cache_ttl_seconds = int(os.environ.get("ANALYZER_CACHE_TTL_SECONDS", "900"))
analysis_cache_version = os.environ.get("ANALYZER_CACHE_VERSION", "v1")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    posthog.shutdown()


app = FastAPI(title="GitGrade Analyzer", version="0.1.0", lifespan=lifespan)


def track_event(event_name: str, properties: dict[str, object]) -> None:
    if not posthog.api_key:
        return

    try:
        posthog.capture("anonymous", event_name, properties)
    except Exception:
        logger.exception("posthog capture failed")


def load_cached_report(cache_key: str) -> GitGradeReport | None:
    if not redis_cache:
        return None

    cached = redis_cache.get_json(cache_key)
    if not cached:
        return None

    try:
        return GitGradeReport.model_validate(cached)
    except Exception:
        return None


def store_cached_report(cache_key: str, report: GitGradeReport) -> None:
    if not redis_cache:
        return

    redis_cache.set_json(cache_key, report.model_dump(mode="json"), analysis_cache_ttl_seconds)


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
    track_event(
        "sample_report_viewed",
        {"grade": report.summary.overall_grade, "score": report.summary.overall_score},
    )
    return report


@app.post("/analyze/repo", response_model=GitGradeReport)
def analyze_repo_endpoint(payload: AnalyzeRepoRequest) -> GitGradeReport:
    cache_key = build_cache_key(
        analysis_cache_version,
        {"mode": "repo", "repo": payload.repo, "commit_limit": payload.commit_limit},
    )
    cached_report = load_cached_report(cache_key)
    if cached_report:
        track_event(
            "repo_analyzed",
            {
                "repo": payload.repo,
                "grade": cached_report.summary.overall_grade,
                "score": cached_report.summary.overall_score,
                "cache_hit": True,
            },
        )
        return cached_report

    report = analyze_repo(payload.repo, payload.commit_limit)
    store_cached_report(cache_key, report)
    track_event(
        "repo_analyzed",
        {
            "repo": payload.repo,
            "grade": report.summary.overall_grade,
            "score": report.summary.overall_score,
            "cache_hit": False,
        },
    )
    return report


@app.post("/analyze/user", response_model=GitGradeReport)
def analyze_user_endpoint(payload: AnalyzeUserRequest) -> GitGradeReport:
    client = GithubClient(token=payload.github_token) if payload.github_token else None
    cache_key = build_cache_key(
        analysis_cache_version,
        {
            "mode": "user",
            "username": payload.username.lower(),
            "selected_repos": [repo.lower() for repo in payload.selected_repos],
            "repo_limit": payload.repo_limit,
            "commits_per_repo": payload.commits_per_repo,
        },
    )
    cached_report = load_cached_report(cache_key)
    if cached_report:
        track_event(
            "user_analyzed",
            {
                "username": payload.username,
                "grade": cached_report.summary.overall_grade,
                "score": cached_report.summary.overall_score,
                "cache_hit": True,
            },
        )
        return cached_report

    report = analyze_user(
        payload.username,
        payload.repo_limit,
        payload.commits_per_repo,
        selected_repo_slugs=payload.selected_repos,
        client=client,
    )
    store_cached_report(cache_key, report)
    track_event(
        "user_analyzed",
        {
            "username": payload.username,
            "grade": report.summary.overall_grade,
            "score": report.summary.overall_score,
            "cache_hit": False,
        },
    )
    return report
