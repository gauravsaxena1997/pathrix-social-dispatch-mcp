import { API_ENDPOINTS, POLL_CONFIG } from "../config";
const YT_BASE = API_ENDPOINTS.yt_api;
const YT_UPLOAD = API_ENDPOINTS.yt_upload;

export interface YouTubePublishResult {
  url: string;
  videoId: string;
  processingStatus: "processed" | "uploaded" | "failed";
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
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`yt_video_fetch_${videoRes.status}: ${videoUrl}`);
  const videoBuffer = await videoRes.arrayBuffer();
  const contentType = videoRes.headers.get("content-type") ?? "video/mp4";
  const contentLength = videoBuffer.byteLength;

  // Step 2: initiate resumable upload session
  const metadata = {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), tags },
    status: {
      privacyStatus: scheduledAt ? "private" : "public",
      ...(scheduledAt ? { publishAt: scheduledAt.toISOString() } : {}),
    },
  };

  const initRes = await fetch(YT_UPLOAD, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(contentLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    throw new Error(`yt_upload_init_${initRes.status}: ${await initRes.text()}`);
  }
  const uploadUri = initRes.headers.get("location");
  if (!uploadUri) throw new Error("yt_upload_no_location_header");

  // Step 3: upload the bytes
  const uploadRes = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
    body: videoBuffer,
  });
  if (!uploadRes.ok && uploadRes.status !== 308) {
    throw new Error(`yt_upload_bytes_${uploadRes.status}: ${await uploadRes.text()}`);
  }
  const uploadJson = (await uploadRes.json()) as { id?: string; status?: { uploadStatus?: string } };
  const videoId = uploadJson.id;
  if (!videoId) throw new Error("yt_upload_no_video_id");

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    processingStatus: uploadJson.status?.uploadStatus === "processed" ? "processed" : "uploaded",
  };
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
