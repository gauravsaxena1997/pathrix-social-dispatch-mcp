import { API_ENDPOINTS } from "../config";
const GRAPH = API_ENDPOINTS.meta;

export function getMetaAuthorizeUrl(state: string, redirectUri: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_contents",
      "instagram_manage_insights",
      "instagram_manage_messages",
      "pages_manage_metadata",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
    ].join(","),
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; token_type: string }> {
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`meta_code_exchange_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getLongLivedToken(
  shortToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`meta_long_lived_token_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshLongLivedToken(
  token: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  return getLongLivedToken(token, clientId, clientSecret);
}

export async function getIgUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=instagram_business_account&access_token=${accessToken}`);
  if (!res.ok) throw new Error(`meta_me_accounts_${res.status}`);
  const json = (await res.json()) as { data?: Array<{ instagram_business_account?: { id: string } }> };
  const igId = json.data?.[0]?.instagram_business_account?.id;
  if (!igId) throw new Error("meta_no_ig_business_account");
  return igId;
}

export async function getPageId(accessToken: string): Promise<{ pageId: string; pageToken: string }> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&access_token=${accessToken}`);
  if (!res.ok) throw new Error(`meta_pages_${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string; access_token: string }> };
  const page = json.data?.[0];
  if (!page) throw new Error("meta_no_page");
  return { pageId: page.id, pageToken: page.access_token };
}

export async function getThreadsUserId(accessToken: string): Promise<string> {
  const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${accessToken}`);
  if (!res.ok) throw new Error(`threads_me_${res.status}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("threads_no_user_id");
  return json.id;
}
