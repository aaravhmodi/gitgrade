import { NextRequest, NextResponse } from "next/server";

const GITHUB_API_URL = "https://api.github.com";

type GithubRepo = {
  id: number;
  full_name: string;
  private: boolean;
  fork: boolean;
  updated_at: string;
  html_url: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = payload?.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "GitHub token is required." }, { status: 400 });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "gitgrade-web",
  };

  const [userResponse, reposResponse] = await Promise.all([
    fetch(`${GITHUB_API_URL}/user`, { headers, cache: "no-store" }),
    fetch(
      `${GITHUB_API_URL}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers, cache: "no-store" }
    ),
  ]);

  if (!userResponse.ok) {
    return NextResponse.json(
      { error: "GitHub authentication failed. Check that the token is valid and has repo access." },
      { status: userResponse.status }
    );
  }

  if (!reposResponse.ok) {
    return NextResponse.json(
      { error: "Unable to load repositories from GitHub." },
      { status: reposResponse.status }
    );
  }

  const user = (await userResponse.json()) as { login: string; name?: string | null };
  const repos = ((await reposResponse.json()) as GithubRepo[])
    .filter((repo) => !repo.fork)
    .map((repo) => ({
      id: repo.id,
      full_name: repo.full_name,
      private: repo.private,
      updated_at: repo.updated_at,
      html_url: repo.html_url,
    }));

  return NextResponse.json({
    username: user.login,
    display_name: user.name ?? user.login,
    repos,
  });
}
