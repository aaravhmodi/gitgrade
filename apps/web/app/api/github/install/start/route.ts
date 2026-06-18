import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildGithubAuthorizeUrl,
  createInstallNonce,
  getGithubAppConfig,
  getMissingGithubAppConfigKeys,
  resolveAppUrl,
} from "@/lib/github-app";

const INSTALL_COOKIE = "gitgrade_github_install_nonce";

export async function GET(request: NextRequest) {
  console.info("[github-install-start]", {
    host: request.nextUrl.host,
    pathname: request.nextUrl.pathname,
    callback_target: "/api/github/callback",
  });

  if (!getGithubAppConfig()) {
    return NextResponse.json(
      { error: `GitHub App is not configured. Missing: ${getMissingGithubAppConfigKeys().join(", ")}` },
      { status: 500 }
    );
  }

  const nonce = createInstallNonce();
  const callbackUrl = resolveAppUrl(request.url, "/api/github/callback");
  const cookieStore = await cookies();
  cookieStore.set(INSTALL_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(buildGithubAuthorizeUrl(callbackUrl));
}
