"use client";

import { FormEvent, useState } from "react";

import type { GitGradeReport } from "@/lib/report-types";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function HomePage() {
  const [mode, setMode] = useState<"user" | "repo">("user");
  const [subject, setSubject] = useState("aaravhmodi");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [report, setReport] = useState<GitGradeReport | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/analyze/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "user"
            ? { username: subject, repo_limit: 6, commits_per_repo: 30 }
            : { repo: subject, commit_limit: 40 }
        ),
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
        <span className="header-status">commit signal · not activity</span>
      </header>

      <section className="hero">
        <h1>Measure GitHub work by impact, not activity.</h1>
        <p className="hero-sub">
          Commit-level scoring for source-heavy engineering work. Separates meaningful
          contributions from maintenance churn and padding.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="mode-toggle">
            <button
              className={mode === "user" ? "mode-btn active" : "mode-btn"}
              onClick={() => { setMode("user"); setSubject("aaravhmodi"); }}
              type="button"
            >
              User
            </button>
            <button
              className={mode === "repo" ? "mode-btn active" : "mode-btn"}
              onClick={() => { setMode("repo"); setSubject("vercel/next.js"); }}
              type="button"
            >
              Repo
            </button>
          </div>

          <div className="input-row">
            <input
              className="text-input"
              onChange={(e) => setSubject(e.target.value)}
              placeholder={mode === "user" ? "username" : "owner/repo"}
              value={subject}
            />
            <button className="btn-primary" disabled={loading || !subject.trim()} type="submit">
              {loading ? "Running…" : "Analyze"}
            </button>
            <button className="btn-secondary" disabled={!report || saving} onClick={handleSaveReport} type="button">
              {saving ? "Saving…" : "Save"}
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
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary?.overall_grade ?? "—"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Meaningful</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary ? pct(summary.meaningful_commit_ratio) : "—"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Impact / commit</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary ? summary.impact_per_commit.toFixed(0) : "—"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Padding risk</div>
          <div className={`metric-value${summary ? "" : " empty"}`}>{summary?.padding_risk ?? "—"}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <p className="card-label">Report</p>
          <h2>{report?.subject_name ?? "No analysis yet"}</h2>
          <p className="card-body">
            {summary
              ? `${summary.total_commits} commits analyzed. ${summary.strongest_signal.replaceAll("_", " ")} leads. ${summary.weakest_signal.replaceAll("_", " ")} lags.`
              : "Run a user or repo analysis to see results here."}
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
