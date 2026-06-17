"use client";

import { FormEvent, useState } from "react";
import type { GitGradeReport } from "@/lib/report-types";

const initialMode = "user";

export default function HomePage() {
  const [mode, setMode] = useState<"user" | "repo">(initialMode);
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

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Analysis failed.");
      }

      const payload = (await response.json()) as GitGradeReport;
      setReport(payload);
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

      setSaveMessage(`Saved report ${payload.id}`);
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const summary = report?.summary;
  const topCommits = report?.top_commits ?? [];
  const commitBreakdown = report ? Object.entries(report.summary.commit_label_breakdown) : [];
  const fileBreakdown = report ? Object.entries(report.summary.file_type_breakdown) : [];

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">GitHub Contribution Intelligence</p>
          <h1>Grade commit history by engineering signal.</h1>
          <p>
            GitGrade combines commit-level ML with weighted file-impact rules so
            source-heavy, coherent engineering work scores above generated churn,
            data dumps, and tiny low-signal edits.
          </p>
        </div>

        <aside className="panel hero-card">
          <h2>Analyze A Repo Or User</h2>
          <p>
            Run the local analyzer on a GitHub username or repository and turn the
            commit stream into an explainable recruiter-style report.
          </p>

          <form className="analyze-form" onSubmit={handleSubmit}>
            <div className="toggle-row">
              <button
                className={mode === "user" ? "toggle active" : "toggle"}
                onClick={() => {
                  setMode("user");
                  setSubject("aaravhmodi");
                }}
                type="button"
              >
                User
              </button>
              <button
                className={mode === "repo" ? "toggle active" : "toggle"}
                onClick={() => {
                  setMode("repo");
                  setSubject("vercel/next.js");
                }}
                type="button"
              >
                Repo
              </button>
            </div>

            <label className="input-label" htmlFor="subject">
              {mode === "user" ? "GitHub username" : "owner/repo"}
            </label>
            <input
              id="subject"
              className="text-input"
              onChange={(event) => setSubject(event.target.value)}
              placeholder={mode === "user" ? "aaravhmodi" : "vercel/next.js"}
              value={subject}
            />

            <button className="submit-button" disabled={loading || !subject.trim()} type="submit">
              {loading ? "Analyzing..." : "Run GitGrade"}
            </button>
            <button
              className="secondary-button"
              disabled={!report || saving}
              onClick={handleSaveReport}
              type="button"
            >
              {saving ? "Saving..." : "Save To Supabase"}
            </button>
          </form>

          {error ? <p className="error-text">{error}</p> : null}
          {saveMessage ? <p className="save-text">{saveMessage}</p> : null}
        </aside>
      </section>

      <section className="grid metrics">
        <article className="panel metric-card">
          <span>Overall Grade</span>
          <strong>{summary?.overall_grade ?? "?"}</strong>
          <p>Weighted outcome from model predictions plus deterministic impact scoring.</p>
        </article>
        <article className="panel metric-card">
          <span>Meaningful Commit Ratio</span>
          <strong>{summary ? `${Math.round(summary.meaningful_commit_ratio * 100)}%` : "?"}</strong>
          <p>Share of commits predicted as medium-value or high-value engineering work.</p>
        </article>
        <article className="panel metric-card">
          <span>Impact Per Commit</span>
          <strong>{summary ? summary.impact_per_commit.toFixed(1) : "?"}</strong>
          <p>Weighted signal density per commit, independent of raw commit volume.</p>
        </article>
        <article className="panel metric-card">
          <span>Padding Risk</span>
          <strong>{summary?.padding_risk ?? "?"}</strong>
          <p>Derived from low-signal concentration, tiny changes, and code-vs-churn balance.</p>
        </article>
      </section>

      <section className="grid sections">
        <article className="panel section-block">
          <div className="section-header">
            <h2>Commit Breakdown</h2>
            <p>
              This shows what the model believes the recent commit stream looks like,
              not just how often someone committed.
            </p>
          </div>

          <div className="report-list">
            {commitBreakdown.length ? (
              commitBreakdown.map(([label, count]) => (
                <div className="report-row" key={label}>
                  <strong>{label.replaceAll("_", " ")}</strong>
                  <em>{count}</em>
                </div>
              ))
            ) : (
              <p className="empty-state">Run an analysis to see commit-class predictions.</p>
            )}
          </div>
        </article>

        <article className="panel report-card">
          <span>Top Commits</span>
          <p>Highest-signal commits after combining model label, confidence, and file-impact weighting.</p>
          <ul>
            {topCommits.length ? (
              topCommits.map((commit) => (
                <li key={commit.sha}>
                  <strong>{commit.message}</strong> ({commit.predicted_label}, {commit.score}/100)
                </li>
              ))
            ) : (
              <li>Run an analysis to surface the strongest commits.</li>
            )}
          </ul>
        </article>
      </section>

      <section className="grid sections">
        <article className="panel section-block">
          <div className="section-header">
            <h2>File Impact</h2>
            <p>
              Source code and core project paths count more than data files, assets,
              generated output, and trivial maintenance churn.
            </p>
          </div>

          <div className="report-list">
            {fileBreakdown.length ? (
              fileBreakdown.map(([label, count]) => (
                <div className="report-row" key={label}>
                  <strong>{label.replaceAll("_", " ")}</strong>
                  <em>{count}</em>
                </div>
              ))
            ) : (
              <p className="empty-state">File-impact breakdown appears after analysis.</p>
            )}
          </div>
        </article>

        <article className="panel report-card">
          <span>Weak Signal Patterns</span>
          <p>These are the patterns the product layer calls out in the final report.</p>
          <ul>
            {summary?.weak_signal_patterns?.length ? (
              summary.weak_signal_patterns.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>No report yet.</li>
            )}
          </ul>

          {summary ? (
            <>
              <span style={{ marginTop: 18 }}>Signal Read</span>
              <p>
                Strongest signal: <strong>{summary.strongest_signal.replaceAll("_", " ")}</strong>
              </p>
              <p>
                Weakest signal: <strong>{summary.weakest_signal.replaceAll("_", " ")}</strong>
              </p>
            </>
          ) : null}
        </article>
      </section>

      <p className="footer-note">
        GitGrade evaluates public commit history quality, not developer worth. It
        discounts data-only churn and generated output, and favors coherent source
        code changes over raw commit volume.
      </p>
    </main>
  );
}
