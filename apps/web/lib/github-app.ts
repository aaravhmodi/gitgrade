import { createHmac, createPrivateKey, createSign, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_OAUTH_URL = "https://github.com/login/oauth";
const SESSION_COOKIE = "gitgrade_github_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type GithubAppConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  slug: string;
};

const REQUIRED_GITHUB_APP_ENV_KEYS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_WEBHOOK_SECRET",
  "GITHUB_APP_SLUG",
] as const;

export type GithubSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  username: string;
};

type GithubOAuthTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
};

export function getGithubAppConfig(): GithubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const slug = process.env.GITHUB_APP_SLUG;
  if (!appId || !clientId || !clientSecret || !privateKey || !webhookSecret || !slug) {
    return null;
  }

  return {
    appId,
    clientId,
    clientSecret,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    webhookSecret,
    slug,
  };
}

export function getMissingGithubAppConfigKeys() {
  return REQUIRED_GITHUB_APP_ENV_KEYS.filter((key) => !process.env[key]);
}

function requireGithubAppConfig() {
  const config = getGithubAppConfig();
  if (!config) {
    const missingKeys = getMissingGithubAppConfigKeys();
    throw new Error(
      missingKeys.length
        ? `GitHub App is not configured. Missing: ${missingKeys.join(", ")}`
        : "GitHub App is not configured."
    );
  }
  return config;
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signCookiePayload(payload: string) {
  const config = requireGithubAppConfig();
  return createHmac("sha256", config.clientSecret).update(payload).digest("base64url");
}

function encodeSession(session: GithubSession) {
  const payload = base64Url(JSON.stringify(session));
  const signature = signCookiePayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(raw: string): GithubSession | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = signCookiePayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as GithubSession;
  } catch {
    return null;
  }
}

export function createGithubJwt() {
  const config = requireGithubAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: config.clientId,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(createPrivateKey(config.privateKey)).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function fetchGithubJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "gitgrade-web",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function exchangeCodeForToken(code: string, callbackUrl: string): Promise<GithubOAuthTokenResponse> {
  const config = requireGithubAppConfig();
  const response = await fetch(`${GITHUB_OAUTH_URL}/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "gitgrade-web",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GithubOAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "GitHub OAuth exchange failed.");
  }

  return payload;
}

async function refreshUserToken(refreshToken: string): Promise<GithubOAuthTokenResponse> {
  const config = requireGithubAppConfig();
  const response = await fetch(`${GITHUB_OAUTH_URL}/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "gitgrade-web",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GithubOAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "GitHub token refresh failed.");
  }

  return payload;
}

function toIsoOrNull(secondsFromNow?: number) {
  if (!secondsFromNow) {
    return null;
  }
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

export async function createSessionFromCode(code: string, callbackUrl: string) {
  const tokenPayload = await exchangeCodeForToken(code, callbackUrl);
  const user = await fetchGithubJson<{ login: string }>(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token ?? null,
    expiresAt: toIsoOrNull(tokenPayload.expires_in),
    refreshTokenExpiresAt: toIsoOrNull(tokenPayload.refresh_token_expires_in),
    username: user.login,
  } satisfies GithubSession;
}

export async function getGithubSession(): Promise<GithubSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const session = decodeSession(raw);
  if (!session) {
    return null;
  }

  if (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now() + 60_000) {
    return session;
  }

  if (!session.refreshToken) {
    return null;
  }

  const refreshed = await refreshUserToken(session.refreshToken);
  const nextSession: GithubSession = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? session.refreshToken,
    expiresAt: toIsoOrNull(refreshed.expires_in),
    refreshTokenExpiresAt: toIsoOrNull(refreshed.refresh_token_expires_in) ?? session.refreshTokenExpiresAt,
    username: session.username,
  };
  await persistGithubSession(nextSession);
  return nextSession;
}

export async function persistGithubSession(session: GithubSession) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearGithubSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getAuthorizedInstallations(accessToken: string) {
  return fetchGithubJson<{ installations: Array<{ id: number; account: { login: string }; target_type: string }> }>(
    `${GITHUB_API_URL}/user/installations`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export async function getInstallationRepositories(accessToken: string, installationId: number) {
  return fetchGithubJson<{
    repositories: Array<{
      id: number;
      full_name: string;
      private: boolean;
      updated_at: string;
      html_url: string;
    }>;
  }>(`${GITHUB_API_URL}/user/installations/${installationId}/repositories?per_page=100`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createInstallationAccessToken(installationId: number, repositoryIds?: number[]) {
  const jwt = createGithubJwt();
  return fetchGithubJson<{
    token: string;
    expires_at: string;
    repositories?: Array<{ id: number; full_name: string }>;
  }>(`${GITHUB_API_URL}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(repositoryIds?.length ? { repository_ids: repositoryIds } : {}),
  });
}

export function buildGithubInstallUrl() {
  const config = requireGithubAppConfig();
  return `https://github.com/apps/${config.slug}/installations/new`;
}

export function buildGithubAuthorizeUrl(callbackUrl: string) {
  const config = requireGithubAppConfig();
  return `${GITHUB_OAUTH_URL}/authorize?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
}

export function verifyGithubWebhookSignature(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) {
    return false;
  }

  const config = requireGithubAppConfig();
  const digest = `sha256=${createHmac("sha256", config.webhookSecret).update(payload).digest("hex")}`;
  const actual = Buffer.from(signatureHeader);
  const expected = Buffer.from(digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createInstallNonce() {
  return randomBytes(16).toString("hex");
}
