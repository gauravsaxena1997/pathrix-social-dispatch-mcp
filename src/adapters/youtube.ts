import { API_ENDPOINTS, POLL_CONFIG } from "../config";
const YT_BASE = API_ENDPOINTS.yt_api;
const YT_UPLOAD = API_ENDPOINTS.yt_upload;

export interface YouTubePublishResult {
  url: string;
  videoId: string;
  processingStatus: "processed" | "uploaded" | "failed";
}

export type YouTubeVideoSource = {
  bytes: ArrayBuffer;
  contentType: string;
  contentLength: number;
};

export async function fetchYouTubeVideoSource(
  videoUrl: string,
): Promise<YouTubeVideoSource> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`yt_video_fetch_${videoRes.status}`);
  const bytes = await videoRes.arrayBuffer();
  return {
    bytes,
    contentType: videoRes.headers.get("content-type") ?? "video/mp4",
    contentLength: bytes.byteLength,
  };
}

export async function initiateYouTubeResumableUpload(input: {
  accessToken: string;
  title: string;
  description: string;
  tags?: string[];
  scheduledAt?: Date;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const metadata = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 5000),
      tags: input.tags ?? [],
    },
    status: {
      privacyStatus: input.scheduledAt ? "private" : "public",
      ...(input.scheduledAt
        ? { publishAt: input.scheduledAt.toISOString() }
        : {}),
    },
  };
  const initRes = await fetch(YT_UPLOAD, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.contentType,
      "X-Upload-Content-Length": String(input.contentLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) throw new Error(`yt_upload_init_${initRes.status}`);
  const uploadUri = initRes.headers.get("location");
  if (!uploadUri) throw new Error("yt_upload_no_location_header");
  return uploadUri;
}

export async function queryYouTubeUploadOffset(
  uploadUri: string,
  contentLength: number,
): Promise<number> {
  const response = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Length": "0",
      "Content-Range": `bytes */${contentLength}`,
    },
  });
  if (response.status === 308) {
    const range = response.headers.get("range");
    const match = range?.match(/bytes=0-(\d+)/);
    return match ? Number(match[1]) + 1 : 0;
  }
  if (response.ok) return contentLength;
  if (response.status === 404 || response.status === 410) {
    throw new Error("yt_upload_session_expired");
  }
  throw new Error(`yt_upload_offset_${response.status}`);
}

export async function uploadYouTubeVideoBytes(input: {
  uploadUri: string;
  source: YouTubeVideoSource;
  offset?: number;
}): Promise<YouTubePublishResult | null> {
  const offset = input.offset ?? 0;
  const bytes = input.source.bytes.slice(offset);
  const uploadRes = await fetch(input.uploadUri, {
    method: "PUT",
    headers: {
      "Content-Type": input.source.contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes ${offset}-${input.source.contentLength - 1}/${input.source.contentLength}`,
    },
    body: bytes,
  });
  if (uploadRes.status === 308) return null;
  if (!uploadRes.ok) throw new Error(`yt_upload_bytes_${uploadRes.status}`);
  const uploadJson = (await uploadRes.json()) as {
    id?: string;
    status?: { uploadStatus?: string };
  };
  if (!uploadJson.id) throw new Error("yt_upload_no_video_id");
  return {
    url: `https://www.youtube.com/watch?v=${uploadJson.id}`,
    videoId: uploadJson.id,
    processingStatus:
      uploadJson.status?.uploadStatus === "processed"
        ? "processed"
        : "uploaded",
  };
}

export async function getYouTubeVideoState(
  accessToken: string,
  videoId: string,
): Promise<{
  uploadStatus: string;
  privacyStatus: string;
  publishAt?: string;
}> {
  const response = await fetch(
    `${YT_BASE}/videos?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`yt_video_state_${response.status}`);
  const data = (await response.json()) as {
    items?: Array<{
      status?: {
        uploadStatus?: string;
        privacyStatus?: string;
        publishAt?: string;
      };
    }>;
  };
  const status = data.items?.[0]?.status;
  if (!status) throw new Error("yt_video_state_missing");
  return {
    uploadStatus: status.uploadStatus ?? "unknown",
    privacyStatus: status.privacyStatus ?? "unknown",
    publishAt: status.publishAt,
  };
}

export async function updateYouTubeVideoSchedule(input: {
  accessToken: string;
  videoId: string;
  scheduledAt?: Date;
}): Promise<void> {
  const response = await fetch(`${YT_BASE}/videos?part=status`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: input.videoId,
      status: {
        privacyStatus: "private",
        ...(input.scheduledAt
          ? { publishAt: input.scheduledAt.toISOString() }
          : {}),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`yt_video_schedule_update_${response.status}`);
  }
}

export async function setYouTubeThumbnail(
  accessToken: string,
  videoId: string,
  thumbnailUrl: string,
): Promise<void> {
  const thumbnail = await fetch(thumbnailUrl);
  if (!thumbnail.ok) {
    throw new Error(`yt_thumbnail_fetch_${thumbnail.status}`);
  }
  const bytes = await thumbnail.arrayBuffer();
  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": thumbnail.headers.get("content-type") ?? "image/jpeg",
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
    },
  );
  if (!response.ok) throw new Error(`yt_thumbnail_set_${response.status}`);
}

export async function addYouTubeVideoToPlaylist(
  accessToken: string,
  videoId: string,
  playlistItem: {
    playlistId: string;
    position?: number;
    note?: string;
    startAt?: string;
    endAt?: string;
  },
): Promise<void> {
  const response = await fetch(`${YT_BASE}/playlistItems?part=snippet,contentDetails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        playlistId: playlistItem.playlistId,
        position: playlistItem.position,
        resourceId: { kind: "youtube#video", videoId },
      },
      contentDetails: {
        note: playlistItem.note,
        startAt: playlistItem.startAt,
        endAt: playlistItem.endAt,
      },
    }),
  });
  if (!response.ok) throw new Error(`yt_playlist_insert_${response.status}`);
}

export async function uploadYouTubeVideo(
  accessToken: string,
  title: string,
  description: string,
  videoUrl: string,
  tags: string[] = [],
  scheduledAt?: Date
): Promise<YouTubePublishResult> {
  // Step 1: fetch the video bytes from the URL
  const source = await fetchYouTubeVideoSource(videoUrl);
  const uploadUri = await initiateYouTubeResumableUpload({
    accessToken,
    title,
    description,
    tags,
    scheduledAt,
    contentType: source.contentType,
    contentLength: source.contentLength,
  });
  const result = await uploadYouTubeVideoBytes({ uploadUri, source });
  if (!result) throw new Error("yt_upload_incomplete");
  return result;
}

export async function pollYouTubeProcessing(
  videoId: string,
  accessToken: string,
  timeoutMs = POLL_CONFIG.yt_processing_timeout_ms
): Promise<"processed" | "failed"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `${YT_BASE}/videos?part=status&id=${videoId}&access_token=${accessToken}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const json = (await res.json()) as {
      items?: Array<{ status?: { uploadStatus?: string; failureReason?: string } }>;
    };
    const uploadStatus = json.items?.[0]?.status?.uploadStatus;
    if (uploadStatus === "processed") return "processed";
    if (uploadStatus === "failed" || uploadStatus === "rejected") return "failed";
    await new Promise((r) => setTimeout(r, POLL_CONFIG.yt_processing_poll_interval_ms));
  }
  return "failed";
}

export async function getYouTubeDailyQuotaUsed(accessToken: string): Promise<number> {
  // YouTube doesn't expose quota via API. Implement tracking in your host via a QuotaStore.
  void accessToken;
  return 0;
}
