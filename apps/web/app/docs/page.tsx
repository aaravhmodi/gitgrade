import Link from "next/link";

const repoPayload = `{
  "repo": "vercel/next.js",
  "commit_limit": 40
}`;

const userPayload = `{
  "username": "aaravhmodi",
  "selected_repos": ["aaravhmodi/gitgrade", "aaravhmodi/news-scraper"],
  "repo_limit": 2,
  "commits_per_repo": 30
}`;

export default function DocsPage() {
  return (
    <main className="shell docs-shell">
      <header className="header">
        <Link className="brand" href="/">
          gitgrade
        </Link>
        <span className="header-status">product docs</span>
      </header>

      <section className="docs-hero">
        <p className="eyebrow">Docs</p>
        <h1>GitGrade evaluates commit history by engineering signal.</h1>
        <p className="hero-sub">
          The web app runs repo and user analysis, persists reports, and presents
          a compact grading summary. The analyzer service owns the scoring logic
          and training pipeline.
        </p>
      </section>

      <div className="divider" />

      <section className="docs-grid">
        <article className="card">
          <p className="card-label">Workspace</p>
          <h2>Monorepo layout</h2>
          <div className="docs-copy">
            <p><strong>`apps/web`</strong> holds the Next.js dashboard and API routes.</p>
            <p><strong>`services/analyzer`</strong> contains the Python scoring and training code.</p>
            <p><strong>`datasets`</strong> stores labeled commit datasets and manifests.</p>
            <p><strong>`reports`</strong> contains sample and generated report artifacts.</p>
          </div>
        </article>

        <article className="card">
          <p className="card-label">Development</p>
          <h2>Run the app</h2>
          <div className="docs-copy">
            <p>Install dependencies, then start the web app from the repo root.</p>
          </div>
          <pre className="code-block">
            <code>{`npm install
npm run dev:web`}</code>
          </pre>
        </article>

        <article className="card">
          <p className="card-label">Connect</p>
          <h2>GitHub repo selection</h2>
          <div className="docs-copy">
            <p>User analysis now starts with a GitHub App install and authorization flow.</p>
            <p>The app redirects users to GitHub, stores the returned session server-side, and loads granted repositories.</p>
            <p>Selected repos are sent to the analyzer so the report targets only the repositories you chose.</p>
          </div>
        </article>

        <article className="card">
          <p className="card-label">Analyzer</p>
          <h2>Run the scoring service</h2>
          <pre className="code-block">
            <code>{`cd services/analyzer
python -m venv .venv
.venv\\Scripts\\activate
pip install -e .
uvicorn gitgrade_analyzer.main:app --reload`}</code>
          </pre>
        </article>

        <article className="card">
          <p className="card-label">API</p>
          <h2>Analyze a repo</h2>
          <pre className="code-block">
            <code>{`POST /api/analyze/repo
${repoPayload}`}</code>
          </pre>
        </article>

        <article className="card">
          <p className="card-label">API</p>
          <h2>Analyze a user</h2>
          <pre className="code-block">
            <code>{`POST /api/analyze/user
${userPayload}`}</code>
          </pre>
        </article>

        <article className="card">
          <p className="card-label">Direction</p>
          <h2>Product sequence</h2>
          <div className="docs-copy">
            <p>Build the rule-based analyzer first.</p>
            <p>Export stable JSON reports.</p>
            <p>Visualize those reports in the web app.</p>
            <p>Add labeled data and ML once the scoring contract is stable.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
