import { API_ENDPOINTS } from "../config";
const GRAPH = API_ENDPOINTS.meta;

export interface MetaPageBinding {
  pageId: string;
  pageName: string;
  pageToken: string;
  igUserId?: string;
  igUsername?: string;
  igName?: string;
}

interface MetaAccountsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: {
      id?: string;
      username?: string;
      name?: string;
    };
  }>;
}

export function getMetaAuthorizeUrl(
  state: string,
  redirectUri: string,
  clientId: string,
  options?: { configId?: string }
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  const configId = options?.configId?.trim();
  if (configId) {
    params.set("config_id", configId);
  } else {
    params.set(
      "scope",
      [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_comments",
        "instagram_manage_insights",
        "instagram_manage_messages",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
      ].join(","),
    );
  }
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

export async function listMetaPageBindings(accessToken: string): Promise<MetaPageBinding[]> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${accessToken}`,
  );
  if (!res.ok) throw new Error(`meta_me_accounts_${res.status}`);
  const json = (await res.json()) as MetaAccountsResponse;
  return (json.data ?? [])
    .filter((page): page is NonNullable<MetaAccountsResponse["data"]>[number] & { id: string; access_token: string } =>
      Boolean(page.id && page.access_token),
    )
    .map((page) => ({
      pageId: page.id,
      pageName: page.name ?? "",
      pageToken: page.access_token,
      igUserId: page.instagram_business_account?.id,
      igUsername: page.instagram_business_account?.username,
      igName: page.instagram_business_account?.name,
    }));
}

export async function resolveMetaPageBinding(
  accessToken: string,
  options?: {
    preferredPageId?: string;
    preferredIgUserId?: string;
    preferredIgUsername?: string;
  }
): Promise<MetaPageBinding> {
  const pages = await listMetaPageBindings(accessToken);
  const preferredPageId = options?.preferredPageId?.trim();
  const preferredIgUserId = options?.preferredIgUserId?.trim();
  const preferredIgUsername = options?.preferredIgUsername?.trim().toLowerCase();

  const exact =
    pages.find((page) => preferredPageId && page.pageId === preferredPageId) ??
    pages.find((page) => preferredIgUserId && page.igUserId === preferredIgUserId) ??
    pages.find((page) => preferredIgUsername && page.igUsername?.toLowerCase() === preferredIgUsername) ??
    pages.find((page) => page.igUserId);

  if (!exact) {
    throw new Error("meta_no_page_binding");
  }

  return exact;
}

export async function getIgUserId(
  accessToken: string,
  options?: { preferredPageId?: string; preferredIgUserId?: string; preferredIgUsername?: string }
): Promise<string> {
  const binding = await resolveMetaPageBinding(accessToken, options);
  const igId = binding.igUserId;
  if (!igId) throw new Error("meta_no_ig_business_account");
  return igId;
}

export async function getPageId(
  accessToken: string,
  options?: { preferredPageId?: string; preferredIgUserId?: string; preferredIgUsername?: string }
): Promise<{ pageId: string; pageToken: string }> {
  const binding = await resolveMetaPageBinding(accessToken, options);
  return { pageId: binding.pageId, pageToken: binding.pageToken };
}

export async function subscribeAppToPage(
  pageId: string,
  pageToken: string,
  subscribedFields = ["feed"]
): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: subscribedFields.join(","),
    access_token: pageToken,
  });
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`meta_subscribe_page_${res.status}: ${await res.text()}`);
  }
}

export async function getThreadsUserId(accessToken: string): Promise<string> {
  const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${accessToken}`);
  if (!res.ok) throw new Error(`threads_me_${res.status}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("threads_no_user_id");
  return json.id;
}
