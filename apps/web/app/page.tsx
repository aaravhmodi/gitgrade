"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type { GitGradeReport } from "@/lib/report-types";

type ConnectedRepo = {
  id: number;
  full_name: string;
  private: boolean;
  updated_at: string;
  html_url: string;
  installation_id: number;
  owner: string;
  target_type: string;
};

const pipelineStats = {
  trainingRows: 2234,
  manualReviews: 332,
  userHistoryRows: 1074,
  featureCount: 47,
  treeCount: 200,
  maxDepth: 8,
};

function formatApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const objectPayload = payload as {
    error?: string;
    detail?: Array<{ msg?: string } | string> | string;
  };

  if (typeof objectPayload.error === "string" && objectPayload.error.trim()) {
    return objectPayload.error;
  }

  if (typeof objectPayload.detail === "string" && objectPayload.detail.trim()) {
    return objectPayload.detail;
  }

  if (Array.isArray(objectPayload.detail) && objectPayload.detail.length) {
    return objectPayload.detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        return item.msg ?? "";
      })
      .filter(Boolean)
      .join(" ");
  }

  return fallback;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ");
}

export default function HomePage() {
  const [mode, setMode] = useState<"user" | "repo">("user");
  const [subject, setSubject] = useState("vercel/next.js");
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<ConnectedRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
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

  const selectedRepoPreview = selectedRepos.slice(0, 4);

  async function loadGithubRepos() {
    setLoadingRepos(true);

    try {
      const response = await fetch("/api/github/repos", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            username?: string;
            repos?: ConnectedRepo[];
          }
        | null;

      if (!response.ok || !payload?.username || !payload?.repos) {
        setConnectedUsername(null);
        setRepos([]);
        setSelectedRepos([]);
        if (payload?.error && response.status !== 401) {
          setConnectingError(payload.error);
        }
        return;
      }

      setConnectedUsername(payload.username);
      setRepos(payload.repos);
      setSelectedRepos((current) =>
        current.length
          ? current.filter((repo) => payload.repos!.some((item) => item.full_name === repo))
          : payload.repos!.slice(0, 6).map((repo) => repo.full_name)
      );
      setConnectingError(null);
    } catch (caughtError) {
      setConnectingError(caughtError instanceof Error ? caughtError.message : "Unable to load repositories.");
    } finally {
      setLoadingRepos(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubError = params.get("github_error");

    if (githubError) {
      setConnectingError(githubError);
      params.delete("github_error");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    } else if (params.get("github_connected")) {
      params.delete("github_connected");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    void loadGithubRepos();
  }, []);

  function handleConnectGithub() {
    window.location.href = "/api/github/install/start";
  }

  async function handleDisconnectGithub() {
    await fetch("/api/github/repos", { method: "DELETE" });
    setConnectedUsername(null);
    setRepos([]);
    setSelectedRepos([]);
    setRepoSearch("");
    setReport(null);
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
              selected_repos: selectedRepos.slice(0, 50),
              repo_limit: Math.max(Math.min(selectedRepos.length, 20), 1),
              commits_per_repo: 30,
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

      const payload = (await response.json().catch(() => null)) as GitGradeReport | { error?: string; detail?: unknown } | null;
      if (!response.ok) {
        throw new Error(formatApiError(payload, "Analysis failed."));
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
  const detailedCommits = report?.commits.slice(0, 6) ?? [];
  const breakdown = summary ? Object.entries(summary.commit_label_breakdown) : [];
  const fileBreakdown = summary
    ? Object.entries(summary.file_type_breakdown).filter(([, count]) => count > 0)
    : [];

  return (
    <main className="shell shell-wide app-shell">
      <header className="header">
        <span className="brand">gitgrade</span>
        <div className="header-links">
          <Link className="header-link" href="/docs">
            Docs
          </Link>
          <span className="header-status">commit signal · not activity</span>
        </div>
      </header>

      <section className="hero hero-grid hero-entrance">
        <div className="hero-copy">
          <p className="eyebrow">Recruiter View</p>
          <h1>100 commits a day does not prove a strong engineer.</h1>
          <p className="hero-sub">
            As a recruiter, raw commit volume does not tell you whether the work is genuine.
            Use this ML-based tool to inspect commit quality, file mix, and implementation depth.
          </p>

          <div className="hero-proof">
            <div className="hero-proof-item">
              <strong>Looks past activity spam</strong>
              <span>Discounts tiny diffs, docs-only churn, generated files, and repetitive noise.</span>
            </div>
            <div className="hero-proof-item">
              <strong>Checks real engineering signal</strong>
              <span>Rewards source-heavy work, test coverage, multi-file implementation, and stronger commit structure.</span>
            </div>
            <div className="hero-proof-item">
              <strong>Turns history into a readout</strong>
              <span>Summarizes meaningful ratio, padding risk, strongest signal, weakest signal, and top commits.</span>
            </div>
          </div>

          <div className="hero-points">
            <div className="hero-point">
              <span className="hero-point-value">{connectedUsername ? selectedRepos.length : "∞"}</span>
              <span className="hero-point-label">
                {connectedUsername ? "repos selected" : "repo-aware scoring"}
              </span>
            </div>
            <div className="hero-point">
              <span className="hero-point-value">{summary?.overall_grade ?? "A→F"}</span>
              <span className="hero-point-label">report grade</span>
            </div>
            <div className="hero-point">
              <span className="hero-point-value">{summary ? summary.total_commits : 40}</span>
              <span className="hero-point-label">commits sampled</span>
            </div>
          </div>
        </div>

        <div className="hero-panel">
          <form className="form form-wide" onSubmit={handleSubmit}>
            <div className="mode-toggle">
              <button
                className={mode === "user" ? "mode-btn active" : "mode-btn"}
                onClick={() => setMode("user")}
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
                {!connectedUsername ? (
                  <div className="connect-actions">
                    <button className="btn-primary" onClick={handleConnectGithub} type="button">
                      Connect GitHub
                    </button>
                    <p className="helper-text">
                      Install the GitHub App, authorize it, and GitGrade will load the repositories
                      you granted access to.
                    </p>
                  </div>
                ) : null}

                {loadingRepos ? (
                  <div className="loading-panel">
                    <div className="spinner" />
                    <div>
                      <p className="loading-title">Loading GitHub repositories</p>
                      <p className="helper-text">Pulling installations and accessible repos into the workspace.</p>
                    </div>
                  </div>
                ) : null}

                {connectedUsername ? (
                  <div className="connected-state">
                    <div className="connected-header">
                      <div>
                        <p className="status-line ok">
                          Connected as <strong>{connectedUsername}</strong>
                        </p>
                        <p className="helper-text">
                          {repos.length} accessible repos across your current installations.
                        </p>
                      </div>
                      <button className="btn-secondary" onClick={handleDisconnectGithub} type="button">
                        Disconnect
                      </button>
                    </div>

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

                    <div className="selection-strip">
                      {selectedRepoPreview.length ? (
                        selectedRepoPreview.map((repo) => <span className="selection-pill" key={repo}>{repo}</span>)
                      ) : (
                        <span className="selection-pill muted">No repositories selected</span>
                      )}
                      {selectedRepos.length > selectedRepoPreview.length ? (
                        <span className="selection-pill muted">+{selectedRepos.length - selectedRepoPreview.length} more</span>
                      ) : null}
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
                                  {repo.private ? "Private" : "Public"} · {repo.target_type.toLowerCase()} · updated{" "}
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
                      {selectedRepos.length} repositories selected. Up to 20 feed one analysis run.
                    </p>
                  </div>
                ) : null}

              {connectingError ? <p className="status-line error">{connectingError}</p> : null}
            </div>
          ) : (
            <div className="repo-mode-panel">
              <p className="helper-text">
                Repo mode is for direct analysis of one public repository by slug, such as
                <strong> `vercel/next.js`</strong>. Use it when you want to inspect a single codebase
                without connecting a GitHub account.
              </p>
              <div className="input-row">
                <input
                  className="text-input"
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="owner/repo"
                  value={subject}
                />
              </div>
            </div>
          )}

            <div className="form-actions">
              <button
                className="btn-primary"
                disabled={
                  loading ||
                  (mode === "repo" ? !subject.trim() : loadingRepos || !connectedUsername || selectedRepos.length === 0)
                }
                type="submit"
              >
                {loading ? "Analyzing..." : "Analyze"}
              </button>
              <button className="btn-secondary" disabled={!report || saving} onClick={handleSaveReport} type="button">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            {error ? <p className="status-line error">{error}</p> : null}
            {saveMessage ? <p className="status-line ok">{saveMessage}</p> : null}
          </form>
        </div>
      </section>

      {loading ? (
        <section className="analysis-loading">
          <div className="analysis-loading-header">
            <div className="spinner spinner-lg" />
            <div>
              <p className="card-label">Running analysis</p>
              <h2>Scoring commit structure and repository signal</h2>
              <p className="card-body">
                Pulling commit history, weighing file mix, and ranking the strongest signals.
              </p>
            </div>
          </div>
          <div className="loading-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card skeleton-card-wide" />
          </div>
        </section>
      ) : null}

      <div className="divider" />

      <div className="metrics section-entrance">
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

      <div className="results-layout section-entrance section-entrance-delay-1">
        <div className="results-main">
          <div className="grid">
            <div className="card card-emphasis">
              <p className="card-label">Report</p>
              <h2>{report?.subject_name ?? "No analysis yet"}</h2>
              <p className="card-body">
                {summary
                  ? `${summary.total_commits} commits analyzed. ${titleize(summary.strongest_signal)} leads. ${titleize(summary.weakest_signal)} lags.`
                  : "Connect GitHub and select repositories, or analyze a single repo directly."}
              </p>
              {summary?.weak_signal_patterns?.length ? (
                <ul className="tag-list">
                  {summary.weak_signal_patterns.slice(0, 4).map((item) => (
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
                      <span>{titleize(label)}</span>
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
                      <span>{titleize(label)}</span>
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
                        <span className="commit-tag">{titleize(commit.predicted_label)}</span>
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
        </div>

        <aside className="results-side">
          <div className="card side-card">
            <p className="card-label">Signal readout</p>
            {summary ? (
              <div className="signal-stack">
                <div className="signal-item">
                  <span className="signal-name">Overall score</span>
                  <strong>{summary.overall_score.toFixed(1)}</strong>
                </div>
                <div className="signal-item">
                  <span className="signal-name">Average commit</span>
                  <strong>{summary.average_commit_score.toFixed(1)}</strong>
                </div>
                <div className="signal-item">
                  <span className="signal-name">Meaningful commits</span>
                  <strong>{summary.meaningful_commits}/{summary.total_commits}</strong>
                </div>
                <div className="signal-item">
                  <span className="signal-name">Inflation ratio</span>
                  <strong>{summary.commit_inflation_ratio.toFixed(2)}</strong>
                </div>
              </div>
            ) : (
              <p className="empty-state">Summary diagnostics appear here after analysis.</p>
            )}
          </div>

          <div className="card side-card">
            <p className="card-label">Detailed commits</p>
            {detailedCommits.length ? (
              <div className="detailed-commit-list">
                {detailedCommits.map((commit) => (
                  <div className="detailed-commit" key={commit.sha}>
                    <div className="detailed-commit-top">
                      <p className="commit-msg">{commit.message}</p>
                      <span className="commit-score">{commit.score}</span>
                    </div>
                    <p className="commit-tag">
                      {titleize(commit.predicted_label)} · confidence {Math.round(commit.confidence * 100)}%
                    </p>
                    <ul className="rationale-list">
                      {commit.rationale.slice(0, 3).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Commit rationale appears here after analysis.</p>
            )}
          </div>
        </aside>
      </div>

      <div className="divider" />

      <section className="pipeline-section section-entrance section-entrance-delay-2">
        <div className="pipeline-header">
          <div>
            <p className="eyebrow">Backend</p>
            <h2>How the scoring pipeline works</h2>
          </div>
          <p className="pipeline-copy">
            A GitGrade product already exists, but this project is my own attempt to rebuild the idea
            from scratch. Instead of treating commit count as proof of skill, this version analyzes
            commit structure, labels likely signal with ML, and blends that with rule-based impact scoring.
          </p>
        </div>

        <div className="pipeline-grid">
          <article className="card pipeline-card">
            <p className="card-label">Training corpus</p>
            <div className="pipeline-metric">{pipelineStats.trainingRows.toLocaleString()}</div>
            <p className="card-body">
              labeled commits in the current merged training set, combining open-source examples with
              local and user-specific history.
            </p>
          </article>

          <article className="card pipeline-card">
            <p className="card-label">Manual review</p>
            <div className="pipeline-metric">{pipelineStats.manualReviews.toLocaleString()}</div>
            <p className="card-body">
              manually reviewed label overrides currently available to correct weak supervision and
              sharpen borderline classifications.
            </p>
          </article>

          <article className="card pipeline-card">
            <p className="card-label">User history</p>
            <div className="pipeline-metric">{pipelineStats.userHistoryRows.toLocaleString()}</div>
            <p className="card-body">
              user-history examples tracked separately for error analysis, review queues, and
              future personalization work.
            </p>
          </article>

          <article className="card pipeline-card">
            <p className="card-label">Feature space</p>
            <div className="pipeline-metric">{pipelineStats.featureCount}</div>
            <p className="card-body">
              engineered features extracted from commit structure, file mix, message patterns,
              change size, and source-vs-non-source ratios.
            </p>
          </article>
        </div>

        <div className="pipeline-detail-grid">
          <article className="card">
            <p className="card-label">Pipeline steps</p>
            <div className="pipeline-steps">
              <div className="pipeline-step">
                <span className="pipeline-step-number">01</span>
                <div>
                  <strong>Ingest</strong>
                  <p className="card-body">Load recent commits from GitHub App-authorized repositories and normalize file-level change statistics.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <span className="pipeline-step-number">02</span>
                <div>
                  <strong>Feature engineering</strong>
                  <p className="card-body">Build 47 model features including file ratios, message-type cues, tiny-diff flags, and source/test pair signals.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <span className="pipeline-step-number">03</span>
                <div>
                  <strong>ML prediction</strong>
                  <p className="card-body">Run a Random Forest classifier with {pipelineStats.treeCount} trees and max depth {pipelineStats.maxDepth} to predict noise, low, medium, or high value.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <span className="pipeline-step-number">04</span>
                <div>
                  <strong>Hybrid scoring</strong>
                  <p className="card-body">Blend deterministic impact heuristics, label weights, and model confidence into one final weighted commit score.</p>
                </div>
              </div>
            </div>
          </article>

          <article className="card">
            <p className="card-label">Scoring blend</p>
            <div className="signal-stack">
              <div className="signal-item">
                <span className="signal-name">Deterministic impact</span>
                <strong>55%</strong>
              </div>
              <div className="signal-item">
                <span className="signal-name">Predicted label weight</span>
                <strong>35%</strong>
              </div>
              <div className="signal-item">
                <span className="signal-name">Model confidence</span>
                <strong>10%</strong>
              </div>
            </div>
            <p className="card-body pipeline-footnote">
              The deterministic pass rewards source-heavy, multi-file, test-backed implementation work and discounts tiny diffs,
              docs-only edits, generated files, and non-code churn before the classifier adjusts the final result.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
