from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class GithubCommitSource:
    owner: str
    repo: str


class GithubApiError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class GithubClient:
    def __init__(self, token: str | None = None, user_agent: str = "gitgrade-dev") -> None:
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.user_agent = user_agent

    def _get_json(self, url: str) -> Any:
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": self.user_agent,
                **({"Authorization": f"Bearer {self.token}"} if self.token else {}),
            },
        )
        try:
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            message = body
            try:
                parsed = json.loads(body)
                if isinstance(parsed, dict):
                    message = parsed.get("message") or parsed.get("error") or body
            except json.JSONDecodeError:
                pass
            raise GithubApiError(error.code, message) from error

    def fetch_recent_commits(self, source: GithubCommitSource, limit: int = 100) -> list[dict[str, Any]]:
        per_page = min(limit, 100)
        query = urllib.parse.urlencode({"per_page": per_page})
        url = f"https://api.github.com/repos/{source.owner}/{source.repo}/commits?{query}"
        payload = self._get_json(url)
        return payload[:limit]

    def fetch_commit_detail(self, source: GithubCommitSource, sha: str) -> dict[str, Any]:
        url = f"https://api.github.com/repos/{source.owner}/{source.repo}/commits/{sha}"
        return self._get_json(url)

    def fetch_user_profile(self, username: str) -> dict[str, Any]:
        return self._get_json(f"https://api.github.com/users/{urllib.parse.quote(username)}")

    def fetch_authenticated_user(self) -> dict[str, Any]:
        return self._get_json("https://api.github.com/user")

    def fetch_user_repositories(self, username: str, per_page: int = 100) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode({"per_page": min(per_page, 100), "sort": "updated"})
        return self._get_json(f"https://api.github.com/users/{urllib.parse.quote(username)}/repos?{query}")

    def fetch_authenticated_user_repositories(self, per_page: int = 100) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode(
            {
                "per_page": min(per_page, 100),
                "sort": "updated",
                "affiliation": "owner,collaborator,organization_member",
            }
        )
        return self._get_json(f"https://api.github.com/user/repos?{query}")
