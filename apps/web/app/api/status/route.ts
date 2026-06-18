import { NextResponse } from "next/server";

import { getGithubAppConfig, getGithubSession, getMissingGithubAppConfigKeys } from "@/lib/github-app";

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://127.0.0.1:8010";

export const dynamic = "force-dynamic";

async function fetchWithTimeout(url: string, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const githubConfigured = Boolean(getGithubAppConfig());
  const githubSession = await getGithubSession();

  let analyzerOnline = false;
  let analyzerStatus: number | null = null;
  try {
    const response = await fetchWithTimeout(`${ANALYZER_URL}/health`);
    analyzerOnline = response.ok;
    analyzerStatus = response.status;
  } catch {
    analyzerOnline = false;
  }

  return NextResponse.json({
    githubConfigured,
    githubMissing: githubConfigured ? [] : getMissingGithubAppConfigKeys(),
    githubConnected: Boolean(githubSession),
    githubUsername: githubSession?.username ?? null,
    analyzerOnline,
    analyzerStatus,
    analyzerUrl: ANALYZER_URL,
  });
}
