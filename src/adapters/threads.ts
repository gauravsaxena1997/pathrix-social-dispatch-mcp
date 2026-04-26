import { API_ENDPOINTS, POLL_CONFIG } from "../config";
const THREADS = API_ENDPOINTS.threads;

export interface ThreadsPublishResult {
  url: string;
  mediaId: string;
}

export async function publishThreadsPost(
  userId: string,
  accessToken: string,
  text: string,
  mediaUrl?: string
): Promise<ThreadsPublishResult> {
  const body: Record<string, string> = { text, access_token: accessToken };
  if (mediaUrl) {
    const isVideo = mediaUrl.match(/\.(mp4|mov)$/i);
    body.media_type = isVideo ? "VIDEO" : "IMAGE";
    if (isVideo) body.video_url = mediaUrl;
    else body.image_url = mediaUrl;
  }

  const containerRes = await fetch(`${THREADS}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const container = (await containerRes.json()) as { id?: string; error?: { message?: string } };
  if (!containerRes.ok || container.error) {
    throw new Error(`threads_container_${containerRes.status}: ${container.error?.message ?? ""}`);
  }
  const containerId = container.id!;

  // Small wait for container to settle
  await new Promise((r) => setTimeout(r, POLL_CONFIG.threads_settle_ms));

  const pubRes = await fetch(`${THREADS}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  const pub = (await pubRes.json()) as { id?: string; error?: { message?: string } };
  if (!pubRes.ok || pub.error) {
    throw new Error(`threads_publish_${pubRes.status}: ${pub.error?.message ?? ""}`);
  }
  const mediaId = pub.id!;
  return { url: `https://www.threads.net/post/${mediaId}`, mediaId };
}
