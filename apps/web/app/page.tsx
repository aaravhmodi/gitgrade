import report from "../../../reports/sample-report.json";

const metrics = [
  {
    label: "Overall Grade",
    value: report.summary.overall_grade,
    description: "Public engineering signal across the analyzed commit set."
  },
  {
    label: "Meaningful Commit Ratio",
    value: `${Math.round(report.summary.meaningful_commit_ratio * 100)}%`,
    description: "Share of commits that likely represent meaningful engineering work."
  },
  {
    label: "Impact Per Commit",
    value: report.summary.impact_per_commit.toFixed(1),
    description: "Average weighted signal per commit, independent of commit count."
  },
  {
    label: "Padding Risk",
    value: report.summary.padding_risk,
    description: "Likelihood that visible activity is inflated by low-signal patterns."
  }
];

const commitBreakdown = Object.entries(report.commit_breakdown);

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Open Source Commit Intelligence</p>
          <h1>Grade GitHub history by signal, not green squares.</h1>
          <p>
            GitGrade turns commit history into an explainable engineering report.
            It surfaces meaningful features, fixes, tests, and refactors while
            discounting low-signal activity like formatting churn, generated files,
            and suspicious commit-padding patterns.
          </p>
        </div>

        <aside className="panel hero-card">
          <h2>Scaffold Status</h2>
          <p>
            This repo starts with a reusable Python analyzer, a sample report
            contract, and a Next.js dashboard shell that can visualize analyzer
            output before the ML layer exists.
          </p>
          <ul>
            <li>Rule-based scoring first</li>
            <li>Stable report JSON contract</li>
            <li>Dashboard-ready metrics and commit summaries</li>
          </ul>
        </aside>
      </section>

      <section className="grid metrics">
        {metrics.map((metric) => (
          <article className="panel metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.description}</p>
          </article>
        ))}
      </section>

      <section className="grid sections">
        <article className="panel section-block">
          <div className="section-header">
            <h2>Commit Breakdown</h2>
            <p>
              Early output shape for category counts. The analyzer can expand this
              into repo-level and user-level trends later without changing the UI
              contract much.
            </p>
          </div>

          <div className="report-list">
            {commitBreakdown.map(([label, count]) => (
              <div className="report-row" key={label}>
                <strong>{label.replaceAll("_", " ")}</strong>
                <em>{count}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="panel report-card">
          <span>Top Commits</span>
          <p>These are the highest-signal examples surfaced by the current report.</p>
          <ul>
            {report.top_commits.map((commit) => (
              <li key={commit.sha}>
                <strong>{commit.message}</strong> ({commit.score}/100)
              </li>
            ))}
          </ul>

          <span style={{ marginTop: 18 }}>Recommendations</span>
          <ul>
            {report.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <p className="footer-note">
        GitGrade evaluates public commit history quality, not developer worth. It
        cannot see private work, design decisions, or offline engineering context.
      </p>
    </main>
  );
}
