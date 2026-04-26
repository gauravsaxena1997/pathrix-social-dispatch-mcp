import { refreshLongLivedToken } from "./auth/meta";
import { refreshYouTubeToken } from "./auth/youtube";
import { refreshXToken } from "./auth/x";
import type { PlatformAuthStore } from "./schema";

const SKEW_MS = 5 * 60 * 1000;

function isTokenValid(expires_at?: number): boolean {
  return !!expires_at && Date.now() + SKEW_MS < expires_at;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env_missing: ${name}`);
  return v;
}

export async function getValidMetaToken(
  accountId: string,
  store: PlatformAuthStore
): Promise<string | null> {
  const auth = await store.load("instagram", accountId);
  if (!auth) return null;
  const { access_token, expires_at } = auth.tokens as { access_token: string; expires_at: number };
  if (isTokenValid(expires_at)) return access_token;

  const refreshed = await refreshLongLivedToken(
    access_token,
    requireEnv("META_APP_ID"),
    requireEnv("META_APP_SECRET")
  );
  const newExpiry = Date.now() + refreshed.expires_in * 1000;
  const tokens = { access_token: refreshed.access_token, expires_at: newExpiry };
  await store.save({ platform: "instagram", accountId, tokens });
  await store.save({ platform: "threads", accountId, tokens });
  await store.save({ platform: "facebook_page", accountId, tokens });
  return refreshed.access_token;
}

export async function getValidYouTubeToken(
  accountId: string,
  store: PlatformAuthStore
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const auth = await store.load("youtube", accountId);
  if (!auth) return null;
  const { access_token, refresh_token, expires_at } = auth.tokens as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  if (isTokenValid(expires_at)) {
    return { accessToken: access_token, refreshToken: refresh_token };
  }

  const refreshed = await refreshYouTubeToken(
    refresh_token,
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET")
  );
  const newExpiry = Date.now() + refreshed.expires_in * 1000;
  await store.save({
    platform: "youtube",
    accountId,
    tokens: { access_token: refreshed.access_token, refresh_token, expires_at: newExpiry },
  });
  return { accessToken: refreshed.access_token, refreshToken: refresh_token };
}

export async function getValidXToken(
  accountId: string,
  store: PlatformAuthStore
): Promise<{ accessToken: string } | null> {
  const auth = await store.load("x", accountId);
  if (!auth) return null;
  const { access_token, refresh_token, expires_at } = auth.tokens as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  if (isTokenValid(expires_at)) return { accessToken: access_token };

  const refreshed = await refreshXToken(
    refresh_token,
    requireEnv("X_CLIENT_ID"),
    requireEnv("X_CLIENT_SECRET")
  );
  const newExpiry = Date.now() + refreshed.expires_in * 1000;
  await store.save({
    platform: "x",
    accountId,
    tokens: {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpiry,
    },
  });
  return { accessToken: refreshed.access_token };
}

export async function refreshAllTokens(store: PlatformAuthStore): Promise<void> {
  await Promise.allSettled([
    getValidMetaToken("default", store),
    getValidYouTubeToken("default", store),
    getValidXToken("default", store),
  ]);
}
