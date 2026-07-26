import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export const YOUTUBE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export type GoogleIdentityClaims = {
  sub: string;
  email?: string;
};

export type YouTubeChannelIdentity = {
  channelId: string;
  title: string;
  handle?: string;
};

export function getYouTubeAuthorizeUrl(
  state: string,
  nonce: string,
  redirectUri: string,
  clientId: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    nonce,
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({ code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) throw new Error(`yt_code_exchange_${res.status}`);
  return res.json();
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonceHash: string,
  hashNonce: (nonce: string) => string,
  verify: typeof jwtVerify = jwtVerify,
): Promise<GoogleIdentityClaims> {
  const verified = await verify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  if (typeof verified.payload.sub !== "string" || verified.payload.sub.length === 0) {
    throw new Error("google_id_token_missing_sub");
  }
  const nonce =
    typeof verified.payload.nonce === "string" ? verified.payload.nonce : "";
  if (!nonce || hashNonce(nonce) !== expectedNonceHash) {
    throw new Error("google_id_token_nonce_mismatch");
  }
  return {
    sub: verified.payload.sub,
    email:
      typeof verified.payload.email === "string"
        ? verified.payload.email
        : undefined,
  };
}

export async function detectAuthenticatedYouTubeChannel(
  accessToken: string,
): Promise<YouTubeChannelIdentity> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=2",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`youtube_channel_verify_failed:${response.status}`);
  }
  const data = (await response.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; customUrl?: string };
    }>;
  };
  const items = data.items ?? [];
  const channel = items[0];
  if (items.length !== 1 || !channel?.id) {
    throw new Error(`youtube_channel_count_invalid:${data.items?.length ?? 0}`);
  }
  const channelId = channel.id;
  return {
    channelId,
    title: channel.snippet?.title ?? channelId,
    handle: channel.snippet?.customUrl,
  };
}

export async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (errorBody?.error === "invalid_grant") {
      throw new Error("yt_refresh_invalid_grant");
    }
    throw new Error(`yt_refresh_${res.status}`);
  }
  return res.json();
}
