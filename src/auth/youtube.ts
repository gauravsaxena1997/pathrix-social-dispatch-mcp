export function getYouTubeAuthorizeUrl(state: string, redirectUri: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }> {
  const body = new URLSearchParams({ code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) throw new Error(`yt_code_exchange_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) throw new Error(`yt_refresh_${res.status}: ${await res.text()}`);
  return res.json();
}
