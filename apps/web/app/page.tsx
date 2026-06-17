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
  const topCommits = report?.top_commits ?? [];
  const breakdown = summary ? Object.entries(summary.commit_label_breakdown) : [];
  const fileBreakdown = summary ? Object.entries(summary.file_type_breakdown).filter(([, count]) => count > 0) : [];

  return (
    <main className="product-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <section className="hero-frame">
        <div className="hero-copy">
          <p className="kicker">GitGrade</p>
          <h1>Measure GitHub work by impact, not activity.</h1>
          <p className="hero-note">
            Commit-level ML plus file-aware scoring for source-heavy engineering work,
            weak maintenance churn, and contribution padding risk.
          </p>
        </div>

        <form className="analysis-bar" onSubmit={handleSubmit}>
          <div className="mode-row">
            <button
              className={mode === "user" ? "mode-pill active" : "mode-pill"}
              onClick={() => {
                setMode("user");
                setSubject("aaravhmodi");
              }}
              type="button"
            >
              user
            </button>
            <button
              className={mode === "repo" ? "mode-pill active" : "mode-pill"}
              onClick={() => {
                setMode("repo");
                setSubject("vercel/next.js");
              }}
              type="button"
            >
              repo
            </button>
          </div>

          <input
            className="subject-input"
            onChange={(event) => setSubject(event.target.value)}
            placeholder={mode === "user" ? "aaravhmodi" : "owner/repo"}
            value={subject}
          />

          <div className="button-row">
            <button className="primary-button" disabled={loading || !subject.trim()} type="submit">
              {loading ? "running..." : "analyze"}
            </button>
            <button className="secondary-button" disabled={!report || saving} onClick={handleSaveReport} type="button">
              {saving ? "saving..." : "save"}
            </button>
          </div>

          {error ? <p className="inline-status error">{error}</p> : null}
          {saveMessage ? <p className="inline-status ok">{saveMessage}</p> : null}
        </form>
      </section>

      <section className="signal-strip">
        <div>
          <span className="signal-label">grade</span>
          <strong>{summary?.overall_grade ?? "?"}</strong>
        </div>
        <div>
          <span className="signal-label">meaningful</span>
          <strong>{summary ? pct(summary.meaningful_commit_ratio) : "?"}</strong>
        </div>
        <div>
          <span className="signal-label">impact</span>
          <strong>{summary ? summary.impact_per_commit.toFixed(0) : "?"}</strong>
        </div>
        <div>
          <span className="signal-label">risk</span>
          <strong>{summary?.padding_risk ?? "?"}</strong>
        </div>
      </section>

      <section className="editorial-grid">
        <article className="editorial-block lead-block">
          <p className="block-label">report</p>
          <h2>{report?.subject_name ?? "run a repo or user analysis"}</h2>
          <p className="block-copy">
            {summary
              ? `${summary.total_commits} commits analyzed. ${summary.strongest_signal.replaceAll("_", " ")} leads the visible signal. ${summary.weakest_signal.replaceAll("_", " ")} lags.`
              : "A one-page product surface for recruiter-facing GitHub signal, not raw green-square activity."}
          </p>
          {summary?.weak_signal_patterns?.length ? (
            <ul className="micro-list">
              {summary.weak_signal_patterns.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="editorial-block">
          <p className="block-label">commit mix</p>
          <div className="data-list">
            {breakdown.length ? (
              breakdown.map(([label, count]) => (
                <div className="data-row" key={label}>
                  <span>{label.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="muted-copy">No analysis yet.</p>
            )}
          </div>
        </article>

        <article className="editorial-block">
          <p className="block-label">file weight</p>
          <div className="data-list">
            {fileBreakdown.length ? (
              fileBreakdown.slice(0, 6).map(([label, count]) => (
                <div className="data-row" key={label}>
                  <span>{label.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="muted-copy">Source-heavy work outranks data and generated churn.</p>
            )}
          </div>
        </article>

        <article className="editorial-block wide-block">
          <p className="block-label">top commits</p>
          <div className="top-commit-list">
            {topCommits.length ? (
              topCommits.slice(0, 4).map((commit) => (
                <div className="top-commit-row" key={commit.sha}>
                  <div>
                    <p>{commit.message}</p>
                    <span>{commit.predicted_label.replaceAll("_", " ")}</span>
                  </div>
                  <strong>{commit.score}</strong>
                </div>
              ))
            ) : (
              <p className="muted-copy">High-signal commits appear here after analysis.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
