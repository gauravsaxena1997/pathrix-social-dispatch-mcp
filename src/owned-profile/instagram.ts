import type {
  OwnedProfilePost,
  OwnedProfileSnapshot,
  OwnedSocialAccountInput,
  OwnedSocialAccountSummary,
  OwnedSocialAnalytics,
  OwnedSocialComment,
  OwnedSocialPostDetails,
  OwnedSocialPostDetailsInput,
  OwnedSocialProfileProvider,
  PendingComment,
} from "../schema";

const GRAPH = "https://graph.facebook.com/v21.0";

type InstagramInsightMetricName =
  | "comments"
  | "impressions"
  | "likes"
  | "reach"
  | "reposts"
  | "saved"
  | "shares"
  | "total_interactions"
  | "views";

export interface InstagramPostInsights {
  comments: number;
  impressions: number;
  likes: number;
  reach: number;
  reposts: number;
  saved: number;
  shares: number;
  total_interactions: number;
  views: number;
}

interface InstagramProfileResponse {
  username: string;
  name: string;
  biography?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url?: string;
  website?: string;
}

interface InstagramMediaResponseItem {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  media_product_type?: string;
}

interface InstagramInsightDataPoint {
  name: string;
  value?: number;
  values?: Array<{ value: number }>;
}

interface InstagramAudienceDataPoint {
  name: string;
  values?: Array<{ value: Record<string, number> }>;
}

interface InstagramComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  like_count?: number;
  replies?: { data?: Array<{ id: string; username: string; text: string; timestamp: string }> };
}

interface InstagramPostCommentResponse {
  data?: InstagramComment[];
}

interface InstagramCommentListResponse {
  data?: Array<{
    id: string;
    text?: string;
    username?: string;
    timestamp?: string;
    like_count?: number;
  }>;
}

interface InstagramInsightResponse {
  data?: InstagramInsightDataPoint[];
}

interface InstagramAccountInsightDataPoint {
  name: string;
  value?: number;
  values?: Array<{ value: number }>;
  total_value?: { value?: number };
}

type InstagramMetricKey = keyof InstagramPostInsights;

const EMPTY_POST_INSIGHTS: InstagramPostInsights = {
  comments: 0,
  impressions: 0,
  likes: 0,
  reach: 0,
  reposts: 0,
  saved: 0,
  shares: 0,
  total_interactions: 0,
  views: 0,
};

const INSIGHT_NAME_MAP: Record<InstagramInsightMetricName, InstagramMetricKey> = {
  comments: "comments",
  impressions: "impressions",
  likes: "likes",
  reach: "reach",
  reposts: "reposts",
  saved: "saved",
  shares: "shares",
  total_interactions: "total_interactions",
  views: "views",
};

function parseInsightValue(metric: InstagramInsightDataPoint): number {
  if (typeof metric.value === "number") return metric.value;
  return metric.values?.[0]?.value ?? 0;
}

function buildEmptyInsights(): InstagramPostInsights {
  return { ...EMPTY_POST_INSIGHTS };
}

function parseInsights(payload: InstagramInsightResponse): InstagramPostInsights {
  const result = buildEmptyInsights();

  for (const metric of payload.data ?? []) {
    const metricName = metric.name as InstagramInsightMetricName;
    const targetKey = INSIGHT_NAME_MAP[metricName];
    if (!targetKey) continue;
    result[targetKey] = parseInsightValue(metric);
  }

  return result;
}

async function fetchGraphJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${GRAPH}${path}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function toAccountSummary(snapshot: OwnedProfileSnapshot): OwnedSocialAccountSummary {
  return {
    platform: "instagram",
    handle: snapshot.handle,
    fetchedAt: snapshot.fetchedAt,
    followers: snapshot.followers,
    following: typeof snapshot.stats.following === "number" ? snapshot.stats.following : undefined,
    totalPosts: typeof snapshot.stats.posts === "number" ? snapshot.stats.posts : undefined,
    displayName: snapshot.displayName,
    avatarUrl: snapshot.avatarUrl,
    biography: typeof snapshot.stats.biography === "string" ? snapshot.stats.biography : undefined,
    website: typeof snapshot.stats.website === "string" ? snapshot.stats.website : undefined,
  };
}

function parseRecordMetric(raw: number | string | undefined): Record<string, number> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed;
  } catch {
    return {};
  }
}

function toAnalytics(snapshot: OwnedProfileSnapshot): OwnedSocialAnalytics {
  return {
    platform: "instagram",
    handle: snapshot.handle,
    fetchedAt: snapshot.fetchedAt,
    metrics: {
      reach_7d: snapshot.stats.reach_7d ?? 0,
      impressions_7d: snapshot.stats.impressions_7d ?? 0,
      profile_views_7d: snapshot.stats.profile_views_7d ?? 0,
    },
    audienceGenderAge: parseRecordMetric(
      typeof snapshot.stats.audience_gender_age === "string" ? snapshot.stats.audience_gender_age : undefined,
    ),
    audienceCountry: parseRecordMetric(
      typeof snapshot.stats.audience_country === "string" ? snapshot.stats.audience_country : undefined,
    ),
    audienceCity: parseRecordMetric(
      typeof snapshot.stats.audience_city === "string" ? snapshot.stats.audience_city : undefined,
    ),
  };
}

async function fetchProfileByUserId(
  igUserId: string,
  accessToken: string,
): Promise<InstagramProfileResponse> {
  const profileRes = await fetch(
    `${GRAPH}/${igUserId}?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${accessToken}`,
    { cache: "no-store" },
  );
  if (!profileRes.ok) {
    throw new Error(`ig_profile_${profileRes.status}: ${await profileRes.text()}`);
  }
  return (await profileRes.json()) as InstagramProfileResponse;
}

type InstagramMediaPageResponse = {
  data?: InstagramMediaResponseItem[];
  paging?: { next?: string };
};

async function fetchMediaPage(url: string): Promise<InstagramMediaPageResponse | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as InstagramMediaPageResponse;
}

async function fetchMedia(
  igUserId: string,
  accessToken: string,
  limit = 25,
): Promise<InstagramMediaResponseItem[]> {
  const firstUrl = `${GRAPH}/${igUserId}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=${Math.max(1, Math.min(limit, 100))}&access_token=${accessToken}`;

  const items: InstagramMediaResponseItem[] = [];
  const seen = new Set<string>();
  let nextUrl: string | undefined = firstUrl;

  while (nextUrl && items.length < limit) {
    const page = await fetchMediaPage(nextUrl);
    if (!page) break;

    for (const item of page.data ?? []) {
      const id = item.id ?? "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push(item);
      if (items.length >= limit) break;
    }

    nextUrl = page.paging?.next;
  }

  return items;
}

async function fetchPostInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string,
): Promise<InstagramPostInsights> {
  const isVideo = mediaType === "VIDEO" || mediaType === "REELS";
  const metrics = isVideo
    ? "likes,comments,saved,reach,views,shares,reposts,total_interactions"
    : "likes,comments,saved,reach,impressions,shares,total_interactions";

  const payload = await fetchGraphJson<InstagramInsightResponse>(
    `/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`,
  );
  if (!payload) return buildEmptyInsights();
  return parseInsights(payload);
}

async function fetchRecentPostInsights(
  media: InstagramMediaResponseItem[],
  accessToken: string,
): Promise<Record<string, InstagramPostInsights>> {
  const postInsights: Record<string, InstagramPostInsights> = {};

  for (const item of media) {
    const id = item.id ?? "";
    if (!id) continue;

    postInsights[id] = await fetchPostInsights(id, item.media_type ?? "IMAGE", accessToken);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return postInsights;
}

function toOwnedProfilePosts(
  media: InstagramMediaResponseItem[],
  postInsights: Record<string, InstagramPostInsights>,
): OwnedProfilePost[] {
  return media.map((item): OwnedProfilePost => {
    const id = item.id ?? "";
    const insights = postInsights[id] ?? EMPTY_POST_INSIGHTS;

    return {
      id,
      url: item.permalink ?? "",
      content: item.caption ?? "",
      publishedAt: item.timestamp ?? "",
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      shares: insights.shares,
      reposts: insights.reposts,
      views: insights.views,
      isViral: (item.like_count ?? 0) > 500,
      imageUrl: item.thumbnail_url ?? item.media_url ?? undefined,
      mediaUrl: item.media_url ?? undefined,
      thumbnailUrl: item.thumbnail_url ?? undefined,
      mediaType: item.media_type ?? undefined,
      mediaProductType: item.media_product_type ?? undefined,
    };
  });
}

async function fetchSevenDayAnalytics(
  igUserId: string,
  accessToken: string,
): Promise<{ reach7d: number; impressions7d: number; profileViews7d: number }> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const until = Math.floor(Date.now() / 1000);
  const payload = await fetchGraphJson<{ data?: InstagramAccountInsightDataPoint[] }>(
    `/${igUserId}/insights?metric=reach,views,profile_views&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${accessToken}`,
  );

  let reach7d = 0;
  let impressions7d = 0;
  let profileViews7d = 0;

  for (const metric of payload?.data ?? []) {
    const total =
      metric.total_value?.value ??
      metric.values?.reduce((acc, value) => acc + (value.value ?? 0), 0) ??
      metric.value ??
      0;
    if (metric.name === "reach") reach7d = total;
    // Meta deprecated account-level impressions on this endpoint in favor of views.
    // Keep writing the total into impressions_7d so existing UI/storage consumers stay compatible.
    if (metric.name === "views" || metric.name === "impressions") impressions7d = total;
    if (metric.name === "profile_views") profileViews7d = total;
  }

  return { reach7d, impressions7d, profileViews7d };
}

async function fetchAudienceAnalytics(
  igUserId: string,
  accessToken: string,
): Promise<{
  audienceGenderAge: Record<string, number>;
  audienceCountry: Record<string, number>;
  audienceCity: Record<string, number>;
}> {
  const payload = await fetchGraphJson<{ data?: InstagramAudienceDataPoint[] }>(
    `/${igUserId}/insights?metric=audience_gender_age,audience_country,audience_city&period=lifetime&access_token=${accessToken}`,
  );

  let audienceGenderAge: Record<string, number> = {};
  let audienceCountry: Record<string, number> = {};
  let audienceCity: Record<string, number> = {};

  for (const metric of payload?.data ?? []) {
    const value = metric.values?.[0]?.value ?? {};
    if (metric.name === "audience_gender_age") audienceGenderAge = value;
    if (metric.name === "audience_country") audienceCountry = value;
    if (metric.name === "audience_city") audienceCity = value;
  }

  return { audienceGenderAge, audienceCountry, audienceCity };
}

async function buildInstagramSnapshot(
  igUserId: string,
  accessToken: string,
): Promise<OwnedProfileSnapshot> {
  const profile = await fetchProfileByUserId(igUserId, accessToken);
  const media = await fetchMedia(igUserId, accessToken, Math.max(profile.media_count, 25));
  const postInsights = await fetchRecentPostInsights(media, accessToken);
  const posts = toOwnedProfilePosts(media, postInsights);

  const [{ reach7d, impressions7d, profileViews7d }, { audienceGenderAge, audienceCountry, audienceCity }] =
    await Promise.all([
      fetchSevenDayAnalytics(igUserId, accessToken).catch(() => ({
        reach7d: 0,
        impressions7d: 0,
        profileViews7d: 0,
      })),
      fetchAudienceAnalytics(igUserId, accessToken).catch(() => ({
        audienceGenderAge: {},
        audienceCountry: {},
        audienceCity: {},
      })),
    ]);

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

async function fetchInstagramComments(
  postId: string,
  accessToken: string,
): Promise<OwnedSocialComment[]> {
  const payload = await fetchGraphJson<InstagramCommentListResponse>(
    `/${postId}/comments?fields=id,text,username,timestamp,like_count&limit=50&access_token=${accessToken}`,
  );

  return (payload?.data ?? []).map((comment) => ({
    id: comment.id,
    username: comment.username ?? "",
    text: comment.text ?? "",
    timestamp: comment.timestamp ?? "",
    likeCount: comment.like_count ?? 0,
  }));
}

async function fetchInstagramPostDetails(
  input: OwnedSocialPostDetailsInput,
): Promise<OwnedSocialPostDetails> {
  const [comments, insights] = await Promise.all([
    fetchInstagramComments(input.postId, input.accessToken).catch(() => []),
    fetchPostInsights(input.postId, "VIDEO", input.accessToken).catch(() => buildEmptyInsights()),
  ]);

  return {
    platform: "instagram",
    postId: input.postId,
    fetchedAt: new Date().toISOString(),
    metrics: {
      comments: insights.comments,
      impressions: insights.impressions,
      likes: insights.likes,
      reach: insights.reach,
      reposts: insights.reposts,
      saved: insights.saved,
      shares: insights.shares,
      total_interactions: insights.total_interactions,
      views: insights.views,
    },
    comments,
  };
}

export async function getIgUserIdForHandle(
  username: string,
  accessToken: string,
): Promise<string | null> {
  const payload = await fetchGraphJson<{
    data?: Array<{ instagram_business_account?: { id: string; username: string } }>;
  }>(`/me/accounts?fields=instagram_business_account{id,username}&access_token=${accessToken}`);

  for (const page of payload?.data ?? []) {
    const account = page.instagram_business_account;
    if (account && account.username === username) return account.id;
  }

  for (const page of payload?.data ?? []) {
    if (page.instagram_business_account?.id) return page.instagram_business_account.id;
  }

  return null;
}

export async function scrapeInstagramGraphProfile(
  igUserId: string,
  accessToken: string,
): Promise<OwnedProfileSnapshot> {
  return buildInstagramSnapshot(igUserId, accessToken);
}

export async function fetchIgPendingComments(
  igUserId: string,
  ownUsername: string,
  accessToken: string,
  opts: { maxPosts?: number; maxPerPost?: number } = {},
): Promise<PendingComment[]> {
  const { maxPosts = 8, maxPerPost = 3 } = opts;
  const pending: PendingComment[] = [];
  const media = await fetchMedia(igUserId, accessToken, maxPosts).catch(() => []);

  for (const post of media) {
    const postId = post.id ?? "";
    if (!postId) continue;

    const postUrl = post.permalink ?? `https://instagram.com/p/${postId}`;
    const postTitle = (post.caption ?? "").slice(0, 80) || "Instagram post";

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const commentsPayload = await fetchGraphJson<InstagramPostCommentResponse>(
        `/${postId}/comments?fields=id,text,username,timestamp,like_count,replies{id,username,text,timestamp}&limit=20&access_token=${accessToken}`,
      );

      let postPendingCount = 0;
      for (const comment of commentsPayload?.data ?? []) {
        if (postPendingCount >= maxPerPost) break;
        if (comment.username === ownUsername) continue;

        const hasOwnReply = (comment.replies?.data ?? []).some((reply) => reply.username === ownUsername);
        if (hasOwnReply) continue;

        const publishedMs = new Date(comment.timestamp).getTime();
        const ageHours = (Date.now() - publishedMs) / 3600_000;

        pending.push({
          commentId: comment.id,
          postId,
          postTitle,
          postUrl,
          commentBody: (comment.text ?? "").slice(0, 300),
          author: comment.username,
          publishedAt: comment.timestamp,
          likes: comment.like_count ?? 0,
          isUrgent: ageHours > 12,
        });
        postPendingCount++;
      }
    } catch {
      // Skip this post when comments cannot be fetched.
    }
  }

  return pending;
}

async function refreshInstagramAccountSnapshot(
  input: OwnedSocialAccountInput,
): Promise<OwnedProfileSnapshot> {
  const igUserId = await getIgUserIdForHandle(input.handle, input.accessToken);
  if (!igUserId) {
    throw new Error(`ig_user_not_found:${input.handle}`);
  }
  return buildInstagramSnapshot(igUserId, input.accessToken);
}

async function getInstagramAccountSummary(
  input: OwnedSocialAccountInput,
): Promise<OwnedSocialAccountSummary> {
  const snapshot = await refreshInstagramAccountSnapshot(input);
  return toAccountSummary(snapshot);
}

async function getInstagramRecentPosts(
  input: OwnedSocialAccountInput & { limit?: number },
): Promise<OwnedProfilePost[]> {
  const snapshot = await refreshInstagramAccountSnapshot(input);
  return snapshot.posts.slice(0, input.limit ?? 3);
}

async function getInstagramAccountAnalytics(
  input: OwnedSocialAccountInput,
): Promise<OwnedSocialAnalytics> {
  const snapshot = await refreshInstagramAccountSnapshot(input);
  return toAnalytics(snapshot);
}

export const instagramOwnedProfileProvider: OwnedSocialProfileProvider = {
  getAccountSummary: getInstagramAccountSummary,
  getRecentPosts: getInstagramRecentPosts,
  getAccountAnalytics: getInstagramAccountAnalytics,
  getPostDetails: fetchInstagramPostDetails,
  refreshAccountSnapshot: refreshInstagramAccountSnapshot,
};
