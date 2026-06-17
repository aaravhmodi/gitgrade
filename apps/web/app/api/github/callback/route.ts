import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { createSessionFromCode, getGithubAppConfig, persistGithubSession } from "@/lib/github-app";

const INSTALL_COOKIE = "gitgrade_github_install_nonce";

export async function GET(request: NextRequest) {
  if (!getGithubAppConfig()) {
    return NextResponse.json({ error: "GitHub App is not configured." }, { status: 500 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");

  if (error) {
    const redirect = new URL("/", request.url);
    redirect.searchParams.set("github_error", errorDescription ?? error);
    return NextResponse.redirect(redirect);
  }

  if (!code) {
    return NextResponse.json({ error: "Missing GitHub authorization code." }, { status: 400 });
  }

  try {
    const session = await createSessionFromCode(code);
    await persistGithubSession(session);
    const cookieStore = await cookies();
    cookieStore.delete(INSTALL_COOKIE);

    const redirect = new URL("/", request.url);
    redirect.searchParams.set("github_connected", "1");
    return NextResponse.redirect(redirect);
  } catch (caughtError) {
    const redirect = new URL("/", request.url);
    redirect.searchParams.set(
      "github_error",
      caughtError instanceof Error ? caughtError.message : "GitHub connection failed."
    );
    return NextResponse.redirect(redirect);
  }
}
