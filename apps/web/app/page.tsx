"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import type { GitGradeReport } from "@/lib/report-types";

type ConnectedRepo = {
  id: number;
  full_name: string;
  private: boolean;
  updated_at: string;
  html_url: string;
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function HomePage() {
  const [mode, setMode] = useState<"user" | "repo">("user");
  const [subject, setSubject] = useState("vercel/next.js");
  const [githubToken, setGithubToken] = useState("");
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<ConnectedRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [connectingError, setConnectingError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [report, setReport] = useState<GitGradeReport | null>(null);

  const filteredRepos = useMemo(() => {
    const query = repoSearch.trim().toLowerCase();
    if (!query) return repos;
    return repos.filter((repo) => repo.full_name.toLowerCase().includes(query));
  }, [repoSearch, repos]);

  async function handleConnectGithub() {
    setLoadingRepos(true);
    setConnectingError(null);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            username?: string;
            repos?: ConnectedRepo[];
          }
        | null;

      if (!response.ok || !payload?.username || !payload?.repos) {
        throw new Error(payload?.error ?? "GitHub connection failed.");
      }

      setConnectedUsername(payload.username);
      setRepos(payload.repos);
      setSelectedRepos(payload.repos.slice(0, 6).map((repo) => repo.full_name));
    } catch (caughtError) {
      setConnectedUsername(null);
      setRepos([]);
      setSelectedRepos([]);
      setConnectingError(caughtError instanceof Error ? caughtError.message : "GitHub connection failed.");
    } finally {
      setLoadingRepos(false);
    }
  }

  function toggleRepo(repoFullName: string) {
    setSelectedRepos((current) =>
      current.includes(repoFullName)
        ? current.filter((repo) => repo !== repoFullName)
        : [...current, repoFullName]
    );
  }

  function selectVisibleRepos() {
    setSelectedRepos((current) => {
      const merged = new Set(current);
      filteredRepos.forEach((repo) => merged.add(repo.full_name));
      return Array.from(merged);
    });
  }

  function clearSelectedRepos() {
    setSelectedRepos([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const requestBody =
        mode === "user"
          ? {
              username: connectedUsername,
              selected_repos: selectedRepos.slice(0, 50),
              repo_limit: Math.max(Math.min(selectedRepos.length, 50), 1),
              commits_per_repo: 30,
              github_token: githubToken,
            }
          : { repo: subject, commit_limit: 40 };

      if (mode === "user") {
        if (!connectedUsername) {
          throw new Error("Connect GitHub before running user analysis.");
        }
        if (!selectedRepos.length) {
          throw new Error("Select at least one repository to analyze.");
        }
      }

      const response = await fetch(`/api/analyze/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json().catch(() => null)) as GitGradeReport | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Analysis failed.");
      }

      setReport(payload as GitGradeReport);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveReport() {
    if (!report) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });

      const payload = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Save failed.");
      }

      setSaveMessage(`Saved ${payload.id}`);
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const summary = report?.summary;
  const topCommits = report?.top_commits ?? [];
  const breakdown = summary ? Object.entries(summary.commit_label_breakdown) : [];
  const fileBreakdown = summary
    ? Object.entries(summary.file_type_breakdown).filter(([, count]) => count > 0)
    : [];

  return (
    <main className="shell">
      <header className="header">
        <span className="brand">gitgrade</span>
        <div className="header-links">
          <Link className="header-link" href="/docs">
            Docs
          </Link>
          <span className="header-status">commit signal · not activity</span>
        </div>
      </header>

      <section className="hero">
        <h1>Measure GitHub work by impact, not activity.</h1>
        <p className="hero-sub">
          Connect GitHub, choose the repositories that matter, and score engineering
          work from commit structure instead of raw activity.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="mode-toggle">
            <button
              className={mode === "user" ? "mode-btn active" : "mode-btn"}
              onClick={() => {
                setMode("user");
              }}
              type="button"
            >
              User
            </button>
            <button
              className={mode === "repo" ? "mode-btn active" : "mode-btn"}
              onClick={() => {
                setMode("repo");
                setSubject("vercel/next.js");
              }}
              type="button"
            >
              Repo
            </button>
          </div>

          {mode === "user" ? (
            <div className="user-connect-panel">
              <div className="input-row">
                <input
                  className="text-input"
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="GitHub personal access token"
                  type="password"
                  value={githubToken}
                />
                <button
                  className="btn-secondary"
                  disabled={loadingRepos || !githubToken.trim()}
                  onClick={handleConnectGithub}
                  type="button"
                >
                  {loadingRepos ? "Connecting..." : "Connect GitHub"}
                </button>
              </div>

              <p className="helper-text">
                Use a GitHub personal access token with repository read access. GitGrade
                uses it to load your repos and analyze selected commit history.
              </p>

              {connectedUsername ? (
                <div className="connected-state">
                  <p className="status-line ok">
                    Connected as <strong>{connectedUsername}</strong>
                  </p>
                  <div className="repo-toolbar">
                    <input
                      className="text-input"
                      onChange={(e) => setRepoSearch(e.target.value)}
                      placeholder="Filter repositories"
                      value={repoSearch}
                    />
                    <button className="btn-secondary" onClick={selectVisibleRepos} type="button">
                      Select visible
                    </button>
                    <button className="btn-secondary" onClick={clearSelectedRepos} type="button">
                      Clear
                    </button>
                  </div>

                  <div className="repo-picker">
                    {filteredRepos.length ? (
                      filteredRepos.map((repo) => {
                        const checked = selectedRepos.includes(repo.full_name);
                        return (
                          <label className={checked ? "repo-option selected" : "repo-option"} key={repo.id}>
                            <input
                              checked={checked}
                              onChange={() => toggleRepo(repo.full_name)}
                              type="checkbox"
                            />
                            <div className="repo-meta">
                              <span className="repo-name">{repo.full_name}</span>
                              <span className="repo-detail">
                                {repo.private ? "Private" : "Public"} · updated{" "}
                                {new Date(repo.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <p className="empty-state">No repositories match the current filter.</p>
                    )}
                  </div>

                  <p className="helper-text">
                    {selectedRepos.length} repositories selected. Up to 50 are sent per analysis run.
                  </p>
                </div>
              ) : null}

              {connectingError ? <p className="status-line error">{connectingError}</p> : null}
            </div>
          ) : (
            <div className="input-row">
              <input
                className="text-input"
                onChange={(e) => setSubject(e.target.value)}
                placeholder="owner/repo"
                value={subject}
              />
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={
                loading ||
                (mode === "repo" ? !subject.trim() : !connectedUsername || selectedRepos.length === 0)
              }
              type="submit"
            >
              {loading ? "Running..." : "Analyze"}
            </button>
            <button className="btn-secondary" disabled={!report || saving} onClick={handleSaveReport} type="button">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {error ? <p className="status-line error">{error}</p> : null}
          {saveMessage ? <p className="status-line ok">{saveMessage}</p> : null}
        </form>
      </section>

      <div className="divider" />

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">Grade</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary?.overall_grade ?? "-"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Meaningful</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary ? pct(summary.meaningful_commit_ratio) : "-"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Impact / commit</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary ? summary.impact_per_commit.toFixed(0) : "-"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Padding risk</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary?.padding_risk ?? "-"}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <p className="card-label">Report</p>
          <h2>{report?.subject_name ?? "No analysis yet"}</h2>
          <p className="card-body">
            {summary
              ? `${summary.total_commits} commits analyzed. ${summary.strongest_signal.replaceAll("_", " ")} leads. ${summary.weakest_signal.replaceAll("_", " ")} lags.`
              : "Connect GitHub and select repositories, or analyze a single repo directly."}
          </p>
          {summary?.weak_signal_patterns?.length ? (
            <ul className="tag-list">
              {summary.weak_signal_patterns.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="card">
          <p className="card-label">Commit mix</p>
          <div className="data-rows">
            {breakdown.length ? (
              breakdown.map(([label, count]) => (
                <div className="data-row" key={label}>
                  <span>{label.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">No data yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <p className="card-label">File weight</p>
          <div className="data-rows">
            {fileBreakdown.length ? (
              fileBreakdown.slice(0, 6).map(([label, count]) => (
                <div className="data-row" key={label}>
                  <span>{label.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">No data yet.</p>
            )}
          </div>
        </div>

        <div className="card card-wide">
          <p className="card-label">Top commits</p>
          <div className="commit-rows">
            {topCommits.length ? (
              topCommits.slice(0, 5).map((commit) => (
                <div className="commit-row" key={commit.sha}>
                  <div>
                    <p className="commit-msg">{commit.message}</p>
                    <span className="commit-tag">{commit.predicted_label.replaceAll("_", " ")}</span>
                  </div>
                  <span className="commit-score">{commit.score}</span>
                </div>
              ))
            ) : (
              <p className="empty-state">High-signal commits appear here after analysis.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
