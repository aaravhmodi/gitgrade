import { NextRequest, NextResponse } from "next/server";

import { getGithubSession } from "@/lib/github-app";

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://127.0.0.1:8010";

type RouteContext = {
  params: {
    mode: string;
  };
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  const mode = context.params.mode;
  if (mode !== "repo" && mode !== "user") {
    return NextResponse.json({ error: "Unknown analysis mode." }, { status: 404 });
  }

  const payload = await request.json();
  if (mode === "user") {
    const session = await getGithubSession();
    if (!session) {
      return NextResponse.json({ error: "Connect GitHub before running user analysis." }, { status: 401 });
    }

    payload.username = session.username;
    payload.github_token = session.accessToken;
  }

  const response = await fetch(`${ANALYZER_URL}/analyze/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text || "Analyzer request failed." }, { status: response.status });
  }

  return NextResponse.json(await response.json(), { status: 200 });
}
