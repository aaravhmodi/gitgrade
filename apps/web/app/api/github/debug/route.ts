import { NextResponse } from "next/server";

import { getMissingGithubAppConfigKeys } from "@/lib/github-app";

export async function GET() {
  const keys = [
    "GITHUB_APP_ID",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_WEBHOOK_SECRET",
    "GITHUB_APP_SLUG",
  ] as const;

  const present = Object.fromEntries(
    keys.map((key) => [key, Boolean(process.env[key])])
  );

  return NextResponse.json({
    present,
    missing: getMissingGithubAppConfigKeys(),
  });
}
