import type {
  OwnedProfileSnapshot,
  OwnedProfilePost,
  OwnedSocialAccountInput,
  OwnedSocialAccountSummary,
  OwnedSocialAnalytics,
  OwnedSocialPostDetails,
  OwnedSocialPostDetailsInput,
  OwnedSocialProfileProvider,
  YouTubeAnalytics28d,
  PendingComment,
} from "../schema";
import { detectAuthenticatedYouTubeChannel } from "../auth/youtube";

const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";

export type YouTubeVideoInventoryKind = "short" | "long" | "unknown";
export type YouTubeVideoInventoryVisibility = "public" | "private" | "unlisted" | "unknown";

export type YouTubeVideoInventoryItem = {
  id: string;
  watchUrl: string;
  shortUrl: string;
  title: string;
  uploadedAt: string | null;
  scheduledAt: string | null;
  visibility: YouTubeVideoInventoryVisibility;
  durationSeconds: number | null;
  kind: YouTubeVideoInventoryKind;
  kindSource: "duration-derived" | "unknown";
  processingStatus: string | null;
  thumbnailUrl: string | null;
};

export type YouTubeVideoInventoryOptions = {
  maxResults?: number;
  kind?: "all" | "short" | "long";
  visibility?: "all" | YouTubeVideoInventoryVisibility;
  delivery?: "all" | "published" | "scheduled";
};

function parseDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

async function ytGet(path: string, token: string): Promise<Response> {
  return fetch(`${YT_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Reads the authenticated channel's uploads playlist in full.  Unlike the
 * profile snapshot, this deliberately includes private and scheduled videos.
 * YouTube's Data API has no native `isShort` field, so the kind is a clearly
 * labelled duration-derived classification (current YouTube Shorts max: 3m).
 */
export async function listAuthenticatedYouTubeVideos(
  accessToken: string,
  options: YouTubeVideoInventoryOptions = {},
): Promise<YouTubeVideoInventoryItem[]> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 500, 1), 500);
  const channelResponse = await ytGet(
    "/channels?part=contentDetails&mine=true&maxResults=1",
    accessToken,
  );
  if (!channelResponse.ok) throw new Error(`youtube_channel_inventory_${channelResponse.status}`);

  const channelData = await channelResponse.json() as {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
  };
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("youtube_uploads_playlist_unavailable");

  const orderedIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, maxResults - orderedIds.length)),
    });
    if (pageToken) query.set("pageToken", pageToken);
    const playlistResponse = await ytGet(`/playlistItems?${query.toString()}`, accessToken);
    if (!playlistResponse.ok) throw new Error(`youtube_uploads_playlist_${playlistResponse.status}`);
    const playlistData = await playlistResponse.json() as {
      items?: Array<{ contentDetails?: { videoId?: string } }>;
      nextPageToken?: string;
    };
    for (const id of playlistData.items?.map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id)) ?? []) {
      orderedIds.push(id);
    }
    pageToken = playlistData.nextPageToken;
  } while (pageToken && orderedIds.length < maxResults);

  const byId = new Map<string, YouTubeVideoInventoryItem>();
  for (let start = 0; start < orderedIds.length; start += 50) {
    const ids = orderedIds.slice(start, start + 50);
    const videosResponse = await ytGet(
      `/videos?part=snippet,contentDetails,status,processingDetails&id=${encodeURIComponent(ids.join(","))}`,
      accessToken,
    );
    if (!videosResponse.ok) throw new Error(`youtube_video_inventory_${videosResponse.status}`);
    const videosData = await videosResponse.json() as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
        contentDetails?: { duration?: string };
        status?: { privacyStatus?: string; publishAt?: string };
        processingDetails?: { processingStatus?: string };
      }>;
    };
    for (const video of videosData.items ?? []) {
      if (!video.id) continue;
      const durationSeconds = parseDuration(video.contentDetails?.duration) ?? null;
      const visibility = ["public", "private", "unlisted"].includes(video.status?.privacyStatus ?? "")
        ? video.status!.privacyStatus as YouTubeVideoInventoryVisibility
        : "unknown";
      byId.set(video.id, {
        id: video.id,
        watchUrl: `https://youtube.com/watch?v=${video.id}`,
        shortUrl: `https://youtube.com/shorts/${video.id}`,
        title: video.snippet?.title ?? "",
        uploadedAt: video.snippet?.publishedAt ?? null,
        scheduledAt: video.status?.publishAt ?? null,
        visibility,
        durationSeconds,
        kind: durationSeconds == null ? "unknown" : durationSeconds <= 180 ? "short" : "long",
        kindSource: durationSeconds == null ? "unknown" : "duration-derived",
        processingStatus: video.processingDetails?.processingStatus ?? null,
        thumbnailUrl: video.snippet?.thumbnails?.high?.url ?? video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url ?? null,
      });
    }
  }

  const now = Date.now();
  return orderedIds.map((id) => byId.get(id)).filter((item): item is YouTubeVideoInventoryItem => Boolean(item)).filter((item) => {
    if (options.kind && options.kind !== "all" && item.kind !== options.kind) return false;
    if (options.visibility && options.visibility !== "all" && item.visibility !== options.visibility) return false;
    if (options.delivery === "published" && item.visibility !== "public") return false;
    if (options.delivery === "scheduled" && !(item.visibility === "private" && item.scheduledAt && new Date(item.scheduledAt).getTime() > now)) return false;
    return true;
  });
}

export async function fetchYouTubeAnalytics(
  token: string,
  options: { startDate?: string; endDate?: string } = {},
): Promise<YouTubeAnalytics28d | null> {
  const completedEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endDate =
    options.endDate ?? completedEnd.toISOString().slice(0, 10);
  const defaultStart = new Date(
    new Date(`${endDate}T00:00:00.000Z`).getTime() - 27 * 24 * 60 * 60 * 1000,
  );
  const startDate = options.startDate ?? defaultStart.toISOString().slice(0, 10);
  const metrics = "estimatedMinutesWatched,views,likes,averageViewDuration,subscribersGained,subscribersLost";

  const res = await fetch(
    `${YT_ANALYTICS_API}/reports?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${endDate}&metrics=${metrics}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { rows?: number[][] };
  const row = data.rows?.[0];
  if (!row) return null;

  return {
    watchTimeMinutes: Math.round(row[0] ?? 0),
    views: Math.round(row[1] ?? 0),
    likes: Math.round(row[2] ?? 0),
    avgViewDurationSec: Math.round(row[3] ?? 0),
    subscribersGained: Math.round(row[4] ?? 0),
    subscribersLost: Math.round(row[5] ?? 0),
  };
}

// Fetch top-level comments on our recent videos that we haven't replied to.
export async function fetchYtPendingComments(
  accessToken: string,
  opts: { maxResults?: number; channelId?: string } = {},
): Promise<PendingComment[]> {
  const { maxResults = 20 } = opts;
  const pending: PendingComment[] = [];

  try {
    const channelId =
      opts.channelId ??
      (await detectAuthenticatedYouTubeChannel(accessToken)).channelId;
    // moderationStatus=heldForReview shows unanswered comments; use likelySpam=false
    const res = await fetch(
      `${YT_API}/commentThreads?part=snippet&allThreadsRelatedToChannelId=${encodeURIComponent(channelId)}&order=time&maxResults=${maxResults}&moderationStatus=published`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API response
    const json: any = await res.json();
    const items: unknown[] = json.items ?? [];

    for (const item of items) {
      const t = item as {
        snippet?: {
          topLevelComment?: {
            id?: string;
            snippet?: {
              authorDisplayName?: string;
              textDisplay?: string;
              publishedAt?: string;
              likeCount?: number;
              videoId?: string;
            };
          };
          totalReplyCount?: number;
          canReply?: boolean;
          videoId?: string;
        };
      };

      const top = t.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      // Skip if channel already replied (totalReplyCount > 0 is a rough proxy;
      // for precision we'd need to fetch replies and check authorChannelId)
      if ((t.snippet?.totalReplyCount ?? 0) > 0) continue;

      const videoId = top.videoId ?? t.snippet?.videoId ?? "";
      const publishedMs = top.publishedAt ? new Date(top.publishedAt).getTime() : 0;
      const ageHours = publishedMs > 0 ? (Date.now() - publishedMs) / 3600_000 : 0;

      pending.push({
        commentId: t.snippet?.topLevelComment?.id ?? "",
        postId: videoId,
        postTitle: "YouTube video",
        postUrl: videoId ? `https://youtube.com/watch?v=${videoId}` : "",
        commentBody: (top.textDisplay ?? "").replace(/<[^>]+>/g, "").slice(0, 300),
        author: top.authorDisplayName ?? "unknown",
        publishedAt: top.publishedAt ?? new Date().toISOString(),
        likes: top.likeCount ?? 0,
        isUrgent: ageHours > 24,
      });
    }
  } catch {
    // return what we have
  }

  return pending;
}

export async function scrapeYouTubeProfileViaApi(
  handle: string,
  accessToken: string
): Promise<OwnedProfileSnapshot | null> {
  const channelRes = await ytGet(
    "/channels?part=snippet,statistics,brandingSettings,contentDetails&mine=true&maxResults=1",
    accessToken
  );
  if (!channelRes.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API response shape handled defensively
  const channelData: any = await channelRes.json();
  const channel = channelData.items?.[0];
  if (!channel) return null;

  const subscriberCount = parseInt(channel.statistics?.subscriberCount ?? "0", 10);
  const videoCount = parseInt(channel.statistics?.videoCount ?? "0", 10);
  const displayName: string = channel.snippet?.title ?? handle;
  const avatarUrl: string | undefined =
    channel.snippet?.thumbnails?.high?.url ??
    channel.snippet?.thumbnails?.medium?.url ??
    channel.snippet?.thumbnails?.default?.url;
  const bannerUrl: string | undefined = channel.brandingSettings?.image?.bannerExternalUrl;
  const uploadsPlaylistId: string | undefined = channel.contentDetails?.relatedPlaylists?.uploads;

  let posts: (OwnedProfilePost & { duration?: number })[] = [];

  if (uploadsPlaylistId) {
    const playlistRes = await ytGet(
      `/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10`,
      accessToken
    );
    if (playlistRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API playlist response
      const playlistData: any = await playlistRes.json();
      const videoIds: string[] = (playlistData.items ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API item shape
        .map((item: any) => item.contentDetails?.videoId as string | undefined)
        .filter((id: string | undefined): id is string => Boolean(id));

      if (videoIds.length > 0) {
        const videosRes = await ytGet(
          `/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}`,
          accessToken
        );
        if (videosRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API video response
          const videosData: any = await videosRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube API video item shape
          posts = (videosData.items ?? []).map((v: any) => {
            const videoId: string = v.id;
            const views = parseInt(v.statistics?.viewCount ?? "0", 10);
            return {
              id: videoId,
              url: `https://youtube.com/watch?v=${videoId}`,
              content: v.snippet?.title ?? "",
              publishedAt: v.snippet?.publishedAt ?? new Date().toISOString(),
              likes: parseInt(v.statistics?.likeCount ?? "0", 10),
              comments: parseInt(v.statistics?.commentCount ?? "0", 10),
              shares: 0,
              views,
              isViral: views > 100_000,
              imageUrl:
                v.snippet?.thumbnails?.high?.url ??
                `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              duration: parseDuration(v.contentDetails?.duration),
            };
          });
        }
      }
    }
  }

  const analytics28d = await fetchYouTubeAnalytics(accessToken);

  return {
    platform: "youtube",
    handle,
    fetchedAt: new Date().toISOString(),
    followers: subscriberCount,
    avatarUrl,
    bannerUrl,
    displayName,
    posts,
    stats: {
      subscriberCount,
      videoCount,
      ...(analytics28d ? { analytics28d: JSON.stringify(analytics28d) } : {}),
    },
  };
}

export async function fetchYouTubePostDetails(
  accessToken: string,
  postId: string,
): Promise<OwnedSocialPostDetails> {
  const videoResponse = await ytGet(
    `/videos?part=statistics&id=${encodeURIComponent(postId)}`,
    accessToken,
  );
  if (!videoResponse.ok) {
    throw new Error(`youtube_video_details_${videoResponse.status}`);
  }
  const videoData = (await videoResponse.json()) as {
    items?: Array<{
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };
  const statistics = videoData.items?.[0]?.statistics;
  if (!statistics) throw new Error("youtube_video_not_found");

  const commentsResponse = await ytGet(
    `/commentThreads?part=snippet&videoId=${encodeURIComponent(postId)}&order=time&maxResults=50`,
    accessToken,
  );
  const commentsData = commentsResponse.ok
    ? ((await commentsResponse.json()) as {
        items?: Array<{
          id?: string;
          snippet?: {
            topLevelComment?: {
              snippet?: {
                authorDisplayName?: string;
                textDisplay?: string;
                publishedAt?: string;
                likeCount?: number;
              };
            };
          };
        }>;
      })
    : {};
  return {
    platform: "youtube",
    postId,
    fetchedAt: new Date().toISOString(),
    metrics: {
      views: Number(statistics.viewCount ?? 0),
      likes: Number(statistics.likeCount ?? 0),
      comments: Number(statistics.commentCount ?? 0),
    },
    comments: (commentsData.items ?? []).map((item) => {
      const snippet = item.snippet?.topLevelComment?.snippet;
      return {
        id: item.id ?? "",
        username: snippet?.authorDisplayName ?? "unknown",
        text: (snippet?.textDisplay ?? "").replace(/<[^>]+>/g, ""),
        timestamp: snippet?.publishedAt ?? "",
        likeCount: snippet?.likeCount ?? 0,
      };
    }),
  };
}

function requireYouTubeSnapshot(snapshot: OwnedProfileSnapshot | null, handle: string): OwnedProfileSnapshot {
  if (!snapshot) {
    throw new Error(`youtube_profile_not_found:${handle}`);
  }
  return snapshot;
}

async function refreshYouTubeAccountSnapshot(input: OwnedSocialAccountInput): Promise<OwnedProfileSnapshot> {
  return requireYouTubeSnapshot(await scrapeYouTubeProfileViaApi(input.handle, input.accessToken), input.handle);
}

async function getYouTubeAccountSummary(input: OwnedSocialAccountInput): Promise<OwnedSocialAccountSummary> {
  const snapshot = await refreshYouTubeAccountSnapshot(input);
  return {
    platform: "youtube",
    handle: snapshot.handle,
    fetchedAt: snapshot.fetchedAt,
    followers: snapshot.followers,
    totalPosts: typeof snapshot.stats.videoCount === "number" ? snapshot.stats.videoCount : undefined,
    displayName: snapshot.displayName,
    avatarUrl: snapshot.avatarUrl,
  };
}

async function getYouTubeRecentPosts(
  input: OwnedSocialAccountInput & { limit?: number },
): Promise<OwnedProfilePost[]> {
  const snapshot = await refreshYouTubeAccountSnapshot(input);
  return snapshot.posts.slice(0, input.limit ?? 3);
}

async function getYouTubeAccountAnalytics(input: OwnedSocialAccountInput): Promise<OwnedSocialAnalytics> {
  const snapshot = await refreshYouTubeAccountSnapshot(input);
  return {
    platform: "youtube",
    handle: snapshot.handle,
    fetchedAt: snapshot.fetchedAt,
    metrics: snapshot.stats,
  };
}

async function getYouTubePostDetails(input: OwnedSocialPostDetailsInput): Promise<OwnedSocialPostDetails> {
  return fetchYouTubePostDetails(input.accessToken, input.postId);
}

export const youtubeOwnedProfileProvider: OwnedSocialProfileProvider = {
  getAccountSummary: getYouTubeAccountSummary,
  getRecentPosts: getYouTubeRecentPosts,
  getAccountAnalytics: getYouTubeAccountAnalytics,
  getPostDetails: getYouTubePostDetails,
  refreshAccountSnapshot: refreshYouTubeAccountSnapshot,
};
