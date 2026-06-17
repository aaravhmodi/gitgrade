import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { buildGithubAuthorizeUrl, createInstallNonce, getGithubAppConfig, getMissingGithubAppConfigKeys } from "@/lib/github-app";

const INSTALL_COOKIE = "gitgrade_github_install_nonce";

export async function GET(request: NextRequest) {
  if (!getGithubAppConfig()) {
    return NextResponse.json(
      { error: `GitHub App is not configured. Missing: ${getMissingGithubAppConfigKeys().join(", ")}` },
      { status: 500 }
    );
  }

  const nonce = createInstallNonce();
  const callbackUrl = new URL("/api/github/callback", request.url).toString();
  const cookieStore = await cookies();
  cookieStore.set(INSTALL_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(buildGithubAuthorizeUrl(callbackUrl));
}
