export function getGmailAuthorizeUrl(state: string, redirectUri: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number; token_type: string }> {
  const body = new URLSearchParams({ code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) throw new Error(`gmail_code_exchange_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshGmailToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('"invalid_grant"')) {
      throw new Error("gmail_refresh_invalid_grant: reconnect Gmail from /api/social-dispatch/auth/gmail");
    }
    throw new Error(`gmail_refresh_${res.status}: ${text}`);
  }
  return res.json();
}
