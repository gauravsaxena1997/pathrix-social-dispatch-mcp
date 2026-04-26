const UA = "pathrix-social-dispatch/0.1 (personal career OS)";
const OAUTH_BASE = "https://oauth.reddit.com";

export interface RedditPostResult {
  url: string;
  id: string;
  subreddit: string;
}

async function submit(
  accessToken: string,
  params: Record<string, string>
): Promise<RedditPostResult> {
  const body = new URLSearchParams({ ...params, resubmit: "true", nsfw: "false", spoiler: "false" });
  const res = await fetch(`${OAUTH_BASE}/api/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`reddit_submit_http_${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    json?: { errors?: [string, string, string][]; data?: { url?: string; id?: string; name?: string } };
  };

  const errors = json?.json?.errors;
  if (errors && errors.length > 0) {
    throw new Error(`reddit_submit_error: ${errors.map((e) => e[1]).join(", ")}`);
  }

  const data = json?.json?.data;
  if (!data?.url) throw new Error("reddit_submit_no_url");

  return {
    url: data.url,
    id: data.id ?? data.name ?? "",
    subreddit: params.sr,
  };
}

export async function publishSelfPost(
  accessToken: string,
  subreddit: string,
  title: string,
  body: string
): Promise<RedditPostResult> {
  return submit(accessToken, { sr: subreddit, kind: "self", title, text: body });
}

export async function publishLinkPost(
  accessToken: string,
  subreddit: string,
  title: string,
  url: string
): Promise<RedditPostResult> {
  return submit(accessToken, { sr: subreddit, kind: "link", title, url });
}

export async function getUserRecentPosts(
  accessToken: string,
  username: string,
  limit = 25
): Promise<Array<{ subreddit: string; isPromotional: boolean; url: string }>> {
  const res = await fetch(
    `${OAUTH_BASE}/user/${encodeURIComponent(username)}/submitted?limit=${limit}&sort=new`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": UA },
    }
  );
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: { children?: Array<{ data: { subreddit: string; is_self: boolean; url: string; title: string } }> };
  };

  return (json?.data?.children ?? []).map((c) => ({
    subreddit: c.data.subreddit,
    isPromotional: !c.data.is_self,
    url: c.data.url,
  }));
}

export function checkSelfPromoRatio(posts: Array<{ isPromotional: boolean }>, maxRatio = 0.1): boolean {
  if (posts.length === 0) return true;
  const promoCount = posts.filter((p) => p.isPromotional).length;
  return promoCount / posts.length <= maxRatio;
}
