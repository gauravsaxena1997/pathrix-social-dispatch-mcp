import type { OwnedProfileSnapshot, OwnedProfilePost, YouTubeAnalytics28d } from "../schema";

const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";

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

export async function fetchYouTubeAnalytics(token: string): Promise<YouTubeAnalytics28d | null> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const metrics = "estimatedMinutesWatched,views,likes,averageViewDuration,subscribersGained,subscribersLost";

  const res = await fetch(
    `${YT_ANALYTICS_API}/reports?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${endDate}&metrics=${metrics}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- YouTube Analytics API response shape
  const data: any = await res.json();
  const row: number[] = data.rows?.[0];
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

export async function scrapeYouTubeProfileViaApi(
  handle: string,
  accessToken: string
): Promise<OwnedProfileSnapshot | null> {
  const channelHandle = handle.startsWith("@") ? handle.slice(1) : handle;
  const channelRes = await ytGet(
    `/channels?part=snippet,statistics,brandingSettings,contentDetails&forHandle=${channelHandle}`,
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
