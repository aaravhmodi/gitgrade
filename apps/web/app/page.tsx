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
        )
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
    if (!report) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report)
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
  const topCommit = report?.top_commits[0];
  const breakdown = summary ? Object.entries(summary.commit_label_breakdown) : [];
  const fileBreakdown = summary ? Object.entries(summary.file_type_breakdown) : [];

  return (
    <main className="minimal-shell">
      <section className="hero-block">
        <div className="hero-copy">
          <p className="micro">GitGrade</p>
          <h1>Commit history, graded by engineering signal.</h1>
        </div>

        <form className="hero-form" onSubmit={handleSubmit}>
          <div className="switcher">
            <button
              className={mode === "user" ? "switch active" : "switch"}
              onClick={() => {
                setMode("user");
                setSubject("aaravhmodi");
              }}
              type="button"
            >
              User
            </button>
            <button
              className={mode === "repo" ? "switch active" : "switch"}
              onClick={() => {
                setMode("repo");
                setSubject("vercel/next.js");
              }}
              type="button"
            >
              Repo
            </button>
          </div>

          <input
            className="hero-input"
            onChange={(event) => setSubject(event.target.value)}
            placeholder={mode === "user" ? "aaravhmodi" : "owner/repo"}
            value={subject}
          />

          <div className="action-row">
            <button className="primary-action" disabled={loading || !subject.trim()} type="submit">
              {loading ? "Running..." : "Analyze"}
            </button>
            <button className="ghost-action" disabled={!report || saving} onClick={handleSaveReport} type="button">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {error ? <p className="status error">{error}</p> : null}
          {saveMessage ? <p className="status ok">{saveMessage}</p> : null}
        </form>
      </section>

      <section className="score-strip">
        <article className="score-card lead">
          <span>Grade</span>
          <strong>{summary?.overall_grade ?? "?"}</strong>
        </article>
        <article className="score-card">
          <span>Meaningful</span>
          <strong>{summary ? pct(summary.meaningful_commit_ratio) : "?"}</strong>
        </article>
        <article className="score-card">
          <span>Impact</span>
          <strong>{summary ? summary.impact_per_commit.toFixed(0) : "?"}</strong>
        </article>
        <article className="score-card">
          <span>Risk</span>
          <strong>{summary?.padding_risk ?? "?"}</strong>
        </article>
      </section>

      <section className="one-page-grid">
        <article className="surface statement">
          <span className="surface-label">Read</span>
          <h2>{report ? report.subject_name : "Run an analysis"}</h2>
          <p>
            {summary
              ? `${summary.strongest_signal.replaceAll("_", " ")} leads. ${summary.weakest_signal.replaceAll("_", " ")} trails. ${summary.total_commits} commits analyzed.`
              : "One clean report for a repo or a GitHub user."}
          </p>
          {summary?.weak_signal_patterns?.length ? (
            <div className="pill-row">
              {summary.weak_signal_patterns.slice(0, 3).map((item) => (
                <span className="pill" key={item}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </article>

        <article className="surface">
          <span className="surface-label">Breakdown</span>
          <div className="stack-list">
            {breakdown.length ? (
              breakdown.map(([label, count]) => (
                <div className="stack-row" key={label}>
                  <span>{label.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No report yet.</p>
            )}
          </div>
        </article>

        <article className="surface">
          <span className="surface-label">File Weight</span>
          <div className="stack-list">
            {fileBreakdown.length ? (
              fileBreakdown
                .filter(([, count]) => count > 0)
                .slice(0, 6)
                .map(([label, count]) => (
                  <div className="stack-row" key={label}>
                    <span>{label.replaceAll("_", " ")}</span>
                    <strong>{count}</strong>
                  </div>
                ))
            ) : (
              <p className="muted">Source-heavy commits score above data and generated churn.</p>
            )}
          </div>
        </article>

        <article className="surface wide">
          <span className="surface-label">Top Commit</span>
          {topCommit ? (
            <>
              <h3>{topCommit.message}</h3>
              <div className="topline">
                <span>{topCommit.predicted_label.replaceAll("_", " ")}</span>
                <strong>{topCommit.score}/100</strong>
              </div>
            </>
          ) : (
            <p className="muted">The strongest commit appears here after analysis.</p>
          )}
        </article>
      </section>
    </main>
  );
}
