from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class GithubCommitSource:
    owner: str
    repo: str


class GithubClient:
    def __init__(self, token: str | None = None, user_agent: str = "gitgrade-dev") -> None:
        self.token = token
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
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch_recent_commits(self, source: GithubCommitSource, limit: int = 100) -> list[dict[str, Any]]:
        per_page = min(limit, 100)
        query = urllib.parse.urlencode({"per_page": per_page})
        url = f"https://api.github.com/repos/{source.owner}/{source.repo}/commits?{query}"
        payload = self._get_json(url)
        return payload[:limit]

    def fetch_commit_detail(self, source: GithubCommitSource, sha: str) -> dict[str, Any]:
        url = f"https://api.github.com/repos/{source.owner}/{source.repo}/commits/{sha}"
        return self._get_json(url)
