import Link from "next/link";

type AuthPageProps = {
  searchParams?: {
    github_connected?: string;
    github_error?: string;
  };
};

export default function AuthPage({ searchParams }: AuthPageProps) {
  const connected = searchParams?.github_connected === "1";
  const error = searchParams?.github_error;

  return (
    <main className="shell shell-wide app-shell">
      <section className="hero hero-grid hero-entrance">
        <div className="hero-copy">
          <p className="eyebrow">GitHub Connect</p>
          <h1>{connected ? "Connection complete." : "Finish GitHub connect."}</h1>
          <p className="hero-sub">
            {connected
              ? "GitGrade has your GitHub session. You can now return to the dashboard and pick repositories."
              : "GitHub finished the redirect back to GitGrade. Use this page if you landed here after authorization."}
          </p>

          {error ? (
            <div className="report-note">
              <strong>Connect error</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="form-actions">
            <Link className="btn-primary" href="/">
              Go to dashboard
            </Link>
            <a className="btn-secondary" href="/api/github/install/start">
              Reconnect GitHub
            </a>
          </div>
        </div>

        <div className="hero-panel">
          <div className="signal-stack">
            <div className="signal-item">
              <span className="signal-name">Landing page</span>
              <strong>/auth</strong>
            </div>
            <div className="signal-item">
              <span className="signal-name">Status</span>
              <strong>{connected ? "Ready" : "Waiting"}</strong>
            </div>
            <div className="signal-item">
              <span className="signal-name">Next step</span>
              <strong>Open dashboard</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
