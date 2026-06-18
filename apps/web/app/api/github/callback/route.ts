import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildGithubInstallUrl,
  createSessionFromCode,
  getAuthorizedInstallations,
  getGithubAppConfig,
  getMissingGithubAppConfigKeys,
  persistGithubSession,
} from "@/lib/github-app";

const INSTALL_COOKIE = "gitgrade_github_install_nonce";

function buildAuthRedirect(request: NextRequest) {
  return new URL("/", request.url);
}

export async function GET(request: NextRequest) {
  if (!getGithubAppConfig()) {
    return NextResponse.json(
      { error: `GitHub App is not configured. Missing: ${getMissingGithubAppConfigKeys().join(", ")}` },
      { status: 500 }
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");
  const installationId = request.nextUrl.searchParams.get("installation_id");
  const setupAction = request.nextUrl.searchParams.get("setup_action");

  if (error) {
    const redirect = buildAuthRedirect(request);
    redirect.searchParams.set("github_error", errorDescription ?? error);
    return NextResponse.redirect(redirect);
  }

  if (!code) {
    if (installationId || setupAction) {
      const redirect = buildAuthRedirect(request);
      redirect.searchParams.set("github_connected", "1");
      return NextResponse.redirect(redirect);
    }

    return NextResponse.json({ error: "Missing GitHub authorization code." }, { status: 400 });
  }

  try {
    const callbackUrl = new URL("/api/github/callback", request.url).toString();
    const session = await createSessionFromCode(code, callbackUrl);
    await persistGithubSession(session);
    const installations = await getAuthorizedInstallations(session.accessToken);
    const cookieStore = await cookies();
    cookieStore.delete(INSTALL_COOKIE);

    if (!installations.installations.length) {
      return NextResponse.redirect(buildGithubInstallUrl());
    }

    const redirect = buildAuthRedirect(request);
    redirect.searchParams.set("github_connected", "1");
    return NextResponse.redirect(redirect);
  } catch (caughtError) {
    const redirect = buildAuthRedirect(request);
    redirect.searchParams.set(
      "github_error",
      caughtError instanceof Error ? caughtError.message : "GitHub connection failed."
    );
    return NextResponse.redirect(redirect);
  }
}
