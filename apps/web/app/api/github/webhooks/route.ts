import { NextRequest, NextResponse } from "next/server";

import { clearGithubSession, getGithubAppConfig, verifyGithubWebhookSignature } from "@/lib/github-app";

export async function POST(request: NextRequest) {
  if (!getGithubAppConfig()) {
    return NextResponse.json({ error: "GitHub App is not configured." }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGithubWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  const body = JSON.parse(payload) as { action?: string };

  if (eventName === "github_app_authorization" && body.action === "revoked") {
    await clearGithubSession();
  }

  return NextResponse.json({ ok: true });
}
