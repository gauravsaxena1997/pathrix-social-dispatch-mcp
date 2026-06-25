import crypto from "crypto";
import { getMetaAuthorizeUrl, exchangeMetaCode, getLongLivedToken } from "./meta";
import { getYouTubeAuthorizeUrl, exchangeYouTubeCode } from "./youtube";
import { generatePkce, getXAuthorizeUrl, exchangeXCode } from "./x";
import { getGmailAuthorizeUrl, exchangeGmailCode } from "./gmail";
import { getDriveAuthorizeUrl, exchangeDriveCode } from "./drive";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env_missing: ${name}`);
  return v;
}

function callbackBase(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) throw new Error("BASE_URL is required. Set NEXT_PUBLIC_BASE_URL in env (e.g. https://example.com).");
  return base;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function initMetaAuth(): { redirectUrl: string; state: string } {
  const clientId = requireEnv("META_APP_ID");
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/meta/callback`;
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim() || "1326467812355174";
  return { redirectUrl: getMetaAuthorizeUrl(state, redirectUri, clientId, { configId }), state };
}

export async function handleMetaCallback(
  code: string,
  state: string,
  expectedState: string
): Promise<{ access_token: string; expires_at: number }> {
  if (state !== expectedState) throw new Error("state_mismatch");
  const clientId = requireEnv("META_APP_ID");
  const clientSecret = requireEnv("META_APP_SECRET");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/meta/callback`;

  const short = await exchangeMetaCode(code, redirectUri, clientId, clientSecret);
  const long = await getLongLivedToken(short.access_token, clientId, clientSecret);
  return { access_token: long.access_token, expires_at: Date.now() + long.expires_in * 1000 };
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

export function initYouTubeAuth(): { redirectUrl: string; state: string } {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/youtube/callback`;
  return { redirectUrl: getYouTubeAuthorizeUrl(state, redirectUri, clientId), state };
}

export async function handleYouTubeCallback(
  code: string,
  state: string,
  expectedState: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  if (state !== expectedState) throw new Error("state_mismatch");
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/youtube/callback`;

  const tok = await exchangeYouTubeCode(code, redirectUri, clientId, clientSecret);
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + tok.expires_in * 1000,
  };
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

export function initGmailAuth(): { redirectUrl: string; state: string } {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/gmail/callback`;
  return { redirectUrl: getGmailAuthorizeUrl(state, redirectUri, clientId), state };
}

export async function handleGmailCallback(
  code: string,
  state: string,
  expectedState: string
): Promise<{ access_token: string; refresh_token?: string; expires_at: number }> {
  if (state !== expectedState) throw new Error("state_mismatch");
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/gmail/callback`;

  const tok = await exchangeGmailCode(code, redirectUri, clientId, clientSecret);
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + tok.expires_in * 1000,
  };
}

// ─── Google Drive ────────────────────────────────────────────────────────────

export function initDriveAuth(): { redirectUrl: string; state: string } {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/drive/callback`;
  return { redirectUrl: getDriveAuthorizeUrl(state, redirectUri, clientId), state };
}

export async function handleDriveCallback(
  code: string,
  state: string,
  expectedState: string
): Promise<{ access_token: string; refresh_token?: string; expires_at: number }> {
  if (state !== expectedState) throw new Error("state_mismatch");
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/drive/callback`;

  const tok = await exchangeDriveCode(code, redirectUri, clientId, clientSecret);
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + tok.expires_in * 1000,
  };
}

// ─── X / Twitter ─────────────────────────────────────────────────────────────

export function initXAuth(): { redirectUrl: string; state: string; verifier: string } {
  const clientId = requireEnv("X_CLIENT_ID");
  const state = crypto.randomBytes(16).toString("hex");
  const { verifier, challenge } = generatePkce();
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/x/callback`;
  return { redirectUrl: getXAuthorizeUrl(state, challenge, redirectUri, clientId), state, verifier };
}

export async function handleXCallback(
  code: string,
  state: string,
  expectedState: string,
  verifier: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  if (state !== expectedState) throw new Error("state_mismatch");
  if (!verifier) throw new Error("missing_verifier");
  const clientId = requireEnv("X_CLIENT_ID");
  const clientSecret = requireEnv("X_CLIENT_SECRET");
  const redirectUri = `${callbackBase()}/api/social-dispatch/auth/x/callback`;

  const tok = await exchangeXCode(code, verifier, redirectUri, clientId, clientSecret);
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + tok.expires_in * 1000,
  };
}
