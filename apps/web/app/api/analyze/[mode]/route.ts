import { NextRequest, NextResponse } from "next/server";

import { getGithubSession } from "@/lib/github-app";

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://127.0.0.1:8010";
const ANALYZER_TIMEOUT_MS = Number(process.env.ANALYZER_TIMEOUT_MS ?? "30000");

function isValidRepoSlug(value: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function extractAnalyzerError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const objectPayload = payload as {
    error?: string;
    detail?: Array<{ msg?: string } | string> | string;
  };

  if (typeof objectPayload.error === "string" && objectPayload.error.trim()) {
    return objectPayload.error;
  }

  if (typeof objectPayload.detail === "string" && objectPayload.detail.trim()) {
    return objectPayload.detail;
  }

  if (Array.isArray(objectPayload.detail) && objectPayload.detail.length) {
    return objectPayload.detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        return item.msg ?? "";
      })
      .filter(Boolean)
      .join(" ");
  }

  return fallback;
}

type RouteContext = {
  params: {
    mode: string;
  };
};

export const dynamic = "force-dynamic";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = ANALYZER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const mode = context.params.mode;
  if (mode !== "repo" && mode !== "user") {
    return NextResponse.json({ error: "Unknown analysis mode." }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid analysis payload." }, { status: 400 });
  }

  if (mode === "user") {
    const session = await getGithubSession();
    if (!session) {
      return NextResponse.json({ error: "Connect GitHub before running user analysis." }, { status: 401 });
    }

    payload.username = session.username;
    payload.github_token = session.accessToken;
  } else if (typeof payload.repo !== "string" || !payload.repo.trim()) {
    return NextResponse.json({ error: "Repo analysis requires a repo slug like owner/repo." }, { status: 400 });
  } else if (!isValidRepoSlug(payload.repo.trim())) {
    return NextResponse.json(
      { error: "Repo slug must use owner/repo format with only letters, numbers, dots, hyphens, or underscores." },
      { status: 400 }
    );
  } else {
    payload.repo = payload.repo.trim();
  }

  try {
    const response = await fetchWithTimeout(`${ANALYZER_URL}/analyze/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const analyzerText = await response.text().catch(() => "");
      let analyzerPayload: unknown = null;
      if (analyzerText) {
        try {
          analyzerPayload = JSON.parse(analyzerText);
        } catch {
          analyzerPayload = { detail: analyzerText };
        }
      }
      return NextResponse.json(
        {
          error: extractAnalyzerError(
            analyzerPayload,
            "Analyzer returned an error."
          ),
          status: response.status,
          source: "analyzer",
          analyzerUrl: ANALYZER_URL,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 200 });
  } catch (caughtError) {
    const timedOut = caughtError instanceof DOMException && caughtError.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? `Analyzer timed out after ${Math.round(ANALYZER_TIMEOUT_MS / 1000)} seconds at ${ANALYZER_URL}.`
          : `Analyzer unavailable at ${ANALYZER_URL}.`,
        status: 503,
        source: "analyzer",
        analyzerUrl: ANALYZER_URL,
      },
      { status: 503 }
    );
  }
}
