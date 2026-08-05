import { open, readFile } from "node:fs/promises";
import { delimiter, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { API_ENDPOINTS, PLATFORM_LIMITS, POLL_CONFIG } from "../config";
const YT_BASE = API_ENDPOINTS.yt_api;
const YT_UPLOAD = API_ENDPOINTS.yt_upload;

export interface YouTubePublishResult {
  url: string;
  videoId: string;
  processingStatus: "processed" | "uploaded" | "failed";
}

export type YouTubeVideoSource = {
  contentType: string;
  contentLength: number;
  readChunk: (start: number, endExclusive: number) => Promise<ArrayBuffer>;
  close?: () => Promise<void>;
};

type YouTubeBinaryAsset = {
  bytes: ArrayBuffer;
  contentType: string;
  contentLength: number;
};

const YOUTUBE_UPLOAD_CHUNK_BYTES = 64 * 1024 * 1024;
const YOUTUBE_UPLOAD_RETRY_LIMIT = 3;

function contentTypeForPath(path: string, fallback: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return fallback;
}

function localAssetPath(source: string): string | null {
  const requestedPath = source.startsWith("/")
    ? source
    : source.startsWith("file://")
      ? fileURLToPath(source)
      : null;
  if (!requestedPath) return null;
  const roots = (process.env.SOCIAL_MEDIA_LOCAL_ROOTS ?? "")
    .split(delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => resolve(root));
  if (roots.length === 0) {
    throw new Error("yt_local_asset_roots_missing");
  }
  const resolvedPath = resolve(requestedPath);
  const allowed = roots.some(
    (root) => resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`),
  );
  if (!allowed) throw new Error("yt_local_asset_path_denied");
  return resolvedPath;
}

async function fetchBinaryAsset(
  source: string,
  fallbackContentType: string,
): Promise<YouTubeBinaryAsset> {
  const localPath = localAssetPath(source);
  if (localPath) {
    const file = await readFile(localPath);
    const bytes = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    return {
      bytes,
      contentType: contentTypeForPath(localPath, fallbackContentType),
      contentLength: bytes.byteLength,
    };
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`yt_asset_fetch_${response.status}`);
  const bytes = await response.arrayBuffer();
  const asset = {
    bytes,
    contentType:
      response.headers.get("content-type") ?? fallbackContentType,
    contentLength: bytes.byteLength,
  };
  assertYouTubeUploadSize(asset.contentLength);
  return asset;
}

function assertYouTubeUploadSize(contentLength: number): void {
  if (contentLength > PLATFORM_LIMITS.youtube.maxUploadBytes) {
    throw new Error(
      `yt_upload_too_large:${contentLength}:${PLATFORM_LIMITS.youtube.maxUploadBytes}`,
    );
  }
}

export async function fetchYouTubeVideoSource(
  videoUrl: string,
): Promise<YouTubeVideoSource> {
  const localPath = localAssetPath(videoUrl);
  if (localPath) {
    const file = await open(localPath, "r");
    const stats = await file.stat();
    assertYouTubeUploadSize(stats.size);
    return {
      contentType: contentTypeForPath(localPath, "video/mp4"),
      contentLength: stats.size,
      readChunk: async (start, endExclusive) => {
        const length = endExclusive - start;
        const buffer = Buffer.allocUnsafe(length);
        const result = await file.read(buffer, 0, length, start);
        if (result.bytesRead !== length) {
          throw new Error("yt_upload_source_read_incomplete");
        }
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer;
      },
      close: () => file.close(),
    };
  }
  const asset = await fetchBinaryAsset(videoUrl, "video/mp4");
  return {
    contentType: asset.contentType,
    contentLength: asset.contentLength,
    readChunk: async (start, endExclusive) =>
      asset.bytes.slice(start, endExclusive),
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
  assertYouTubeUploadSize(input.contentLength);
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
  let offset = input.offset ?? 0;
  while (offset < input.source.contentLength) {
    const endExclusive = Math.min(
      offset + YOUTUBE_UPLOAD_CHUNK_BYTES,
      input.source.contentLength,
    );
    let shouldRetry = true;
    for (let attempt = 1; attempt <= YOUTUBE_UPLOAD_RETRY_LIMIT; attempt += 1) {
      try {
        const bytes = await input.source.readChunk(offset, endExclusive);
        const uploadRes = await fetch(input.uploadUri, {
          method: "PUT",
          headers: {
            "Content-Type": input.source.contentType,
            "Content-Length": String(bytes.byteLength),
            "Content-Range": `bytes ${offset}-${endExclusive - 1}/${input.source.contentLength}`,
          },
          body: bytes,
        });
        if (uploadRes.status === 308) {
          const range = uploadRes.headers.get("range");
          const match = range?.match(/bytes=0-(\d+)/);
          offset = match ? Number(match[1]) + 1 : endExclusive;
          shouldRetry = false;
          break;
        }
        if (!uploadRes.ok) {
          if (uploadRes.status < 500 && uploadRes.status !== 408 && uploadRes.status !== 429) {
            throw new Error(`yt_upload_bytes_${uploadRes.status}`);
          }
          throw new Error(`yt_upload_transient_${uploadRes.status}`);
        }
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
      } catch (error) {
        if (attempt === YOUTUBE_UPLOAD_RETRY_LIMIT) throw error;
        offset = await queryYouTubeUploadOffset(
          input.uploadUri,
          input.source.contentLength,
        );
        if (offset >= input.source.contentLength) {
          throw new Error("yt_upload_completed_without_response");
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(10_000, attempt * 2_000)),
        );
      }
    }
    if (shouldRetry) {
      throw new Error("yt_upload_chunk_retry_exhausted");
    }
  }
  return null;
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
  const thumbnail = await fetchBinaryAsset(thumbnailUrl, "image/jpeg");
  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": thumbnail.contentType,
        "Content-Length": String(thumbnail.contentLength),
      },
      body: thumbnail.bytes,
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
