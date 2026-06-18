import { NextResponse } from "next/server";

import {
  GithubApiError,
  clearGithubSession,
  getAuthorizedInstallations,
  getGithubAppConfig,
  getGithubSession,
  getInstallationRepositories,
  getMissingGithubAppConfigKeys,
} from "@/lib/github-app";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!getGithubAppConfig()) {
    return NextResponse.json(
      { error: `GitHub App is not configured. Missing: ${getMissingGithubAppConfigKeys().join(", ")}` },
      { status: 500 }
    );
  }

  const session = await getGithubSession();
  if (!session) {
    return NextResponse.json({ error: "Not connected to GitHub." }, { status: 401 });
  }

  try {
    const installationsResponse = await getAuthorizedInstallations(session.accessToken);
    const reposByInstallation = await Promise.all(
      installationsResponse.installations.map(async (installation) => {
        const reposResponse = await getInstallationRepositories(session.accessToken, installation.id);
        return reposResponse.repositories.map((repo) => ({
          id: repo.id,
          full_name: repo.full_name,
          private: repo.private,
          updated_at: repo.updated_at,
          html_url: repo.html_url,
          installation_id: installation.id,
          owner: installation.account.login,
          target_type: installation.target_type,
        }));
      })
    );

    return NextResponse.json({
      username: session.username,
      repos: reposByInstallation.flat().sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    });
  } catch (caughtError) {
    const status = caughtError instanceof GithubApiError ? caughtError.status : 401;
    if (status === 401 || status === 403) {
      await clearGithubSession();
    }
    return NextResponse.json(
      { error: caughtError instanceof Error ? caughtError.message : "Unable to load repositories from GitHub." },
      { status }
    );
  }
}

export async function DELETE() {
  await clearGithubSession();
  return NextResponse.json({ ok: true });
}
