import type { OwnedProfileSnapshot, OwnedProfilePost } from "../schema";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function getIgUserIdForHandle(
  username: string,
  accessToken: string
): Promise<string | null> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=instagram_business_account{id,username}&access_token=${accessToken}`
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: Array<{ instagram_business_account?: { id: string; username: string } }>;
  };
  for (const page of json.data ?? []) {
    const ig = page.instagram_business_account;
    if (ig && ig.username === username) return ig.id;
  }
  for (const page of json.data ?? []) {
    if (page.instagram_business_account?.id) return page.instagram_business_account.id;
  }
  return null;
}

async function fetchPostInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string
): Promise<{ saves: number; impressions: number; reach: number; video_views: number }> {
  const isVideo = mediaType === "VIDEO" || mediaType === "REELS";
  const metrics = isVideo ? "impressions,reach,saved,video_views" : "impressions,reach,saved";
  try {
    const res = await fetch(
      `${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
    );
    if (!res.ok) return { saves: 0, impressions: 0, reach: 0, video_views: 0 };
    const json = (await res.json()) as {
      data?: Array<{ name: string; values: Array<{ value: number }> } | { name: string; value: number }>;
    };
    const result = { saves: 0, impressions: 0, reach: 0, video_views: 0 };
    for (const m of json.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Instagram Graph API insight metric shape differs between legacy (values[]) and current (value)
      const val = "value" in m ? m.value : (m as any).values?.[0]?.value ?? 0;
      if (m.name === "saved") result.saves = val;
      if (m.name === "impressions") result.impressions = val;
      if (m.name === "reach") result.reach = val;
      if (m.name === "video_views") result.video_views = val;
    }
    return result;
  } catch {
    return { saves: 0, impressions: 0, reach: 0, video_views: 0 };
  }
}

export async function scrapeInstagramGraphProfile(
  igUserId: string,
  accessToken: string
): Promise<OwnedProfileSnapshot> {
  const profileRes = await fetch(
    `${GRAPH}/${igUserId}?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${accessToken}`
  );
  if (!profileRes.ok) {
    throw new Error(`ig_profile_${profileRes.status}: ${await profileRes.text()}`);
  }
  const profile = (await profileRes.json()) as {
    username: string;
    name: string;
    biography?: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
    profile_picture_url?: string;
    website?: string;
  };

  let rawMedia: Array<Record<string, unknown>> = [];
  const mediaRes = await fetch(
    `${GRAPH}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=25&access_token=${accessToken}`
  );
  if (mediaRes.ok) {
    const mediaJson = (await mediaRes.json()) as { data?: Array<Record<string, unknown>> };
    rawMedia = mediaJson.data ?? [];
  }

  const postInsights: Record<string, { saves: number; impressions: number; reach: number; video_views: number }> = {};
  for (const m of rawMedia) {
    const id = String(m.id ?? "");
    const type = String(m.media_type ?? "IMAGE");
    if (id) {
      postInsights[id] = await fetchPostInsights(id, type, accessToken);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const posts: OwnedProfilePost[] = rawMedia.map((m): OwnedProfilePost => ({
    id: String(m.id ?? ""),
    url: String(m.permalink ?? ""),
    content: String(m.caption ?? ""),
    publishedAt: String(m.timestamp ?? ""),
    likes: Number(m.like_count ?? 0),
    comments: Number(m.comments_count ?? 0),
    views: postInsights[String(m.id ?? "")]?.video_views ?? 0,
    isViral: Number(m.like_count ?? 0) > 500,
    imageUrl: String(m.media_url ?? m.thumbnail_url ?? "") || undefined,
  }));

  let reach7d = 0;
  let impressions7d = 0;
  let profileViews7d = 0;
  try {
    const since = Math.floor(Date.now() / 1000) - 7 * 86400;
    const until = Math.floor(Date.now() / 1000);
    const insRes = await fetch(
      `${GRAPH}/${igUserId}/insights?metric=reach,impressions,profile_views&period=day&since=${since}&until=${until}&access_token=${accessToken}`
    );
    if (insRes.ok) {
      const insJson = (await insRes.json()) as {
        data?: Array<{ name: string; values: Array<{ value: number }> }>;
      };
      for (const metric of insJson.data ?? []) {
        const total = metric.values.reduce((acc, v) => acc + (v.value ?? 0), 0);
        if (metric.name === "reach") reach7d = total;
        if (metric.name === "impressions") impressions7d = total;
        if (metric.name === "profile_views") profileViews7d = total;
      }
    }
  } catch {
    // not available for small accounts
  }

  let audienceGenderAge: Record<string, number> = {};
  let audienceCountry: Record<string, number> = {};
  let audienceCity: Record<string, number> = {};
  try {
    const audRes = await fetch(
      `${GRAPH}/${igUserId}/insights?metric=audience_gender_age,audience_country,audience_city&period=lifetime&access_token=${accessToken}`
    );
    if (audRes.ok) {
      const audJson = (await audRes.json()) as {
        data?: Array<{ name: string; values: Array<{ value: Record<string, number> }> }>;
      };
      for (const metric of audJson.data ?? []) {
        const val = metric.values?.[0]?.value ?? {};
        if (metric.name === "audience_gender_age") audienceGenderAge = val;
        if (metric.name === "audience_country") audienceCountry = val;
        if (metric.name === "audience_city") audienceCity = val;
      }
    }
  } catch {
    // not available for small accounts
  }

  return {
    platform: "instagram",
    handle: profile.username,
    displayName: profile.name,
    fetchedAt: new Date().toISOString(),
    followers: profile.followers_count,
    avatarUrl: profile.profile_picture_url,
    posts,
    stats: {
      following: profile.follows_count,
      posts: profile.media_count,
      biography: profile.biography ?? "",
      website: profile.website ?? "",
      reach_7d: reach7d,
      impressions_7d: impressions7d,
      profile_views_7d: profileViews7d,
      post_insights: JSON.stringify(postInsights),
      audience_gender_age: JSON.stringify(audienceGenderAge),
      audience_country: JSON.stringify(audienceCountry),
      audience_city: JSON.stringify(audienceCity),
    },
  };
}
