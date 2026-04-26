import { API_ENDPOINTS } from "../config";
const GRAPH = API_ENDPOINTS.meta;

export interface FbPagePublishResult {
  url: string;
  postId: string;
}

export async function publishFbPagePost(
  pageId: string,
  pageToken: string,
  message: string,
  link?: string
): Promise<FbPagePublishResult> {
  const body: Record<string, string> = { message, access_token: pageToken };
  if (link) body.link = link;

  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(`fb_page_post_${res.status}: ${json.error?.message ?? JSON.stringify(json).slice(0, 200)}`);
  }
  const postId = json.id!;
  return { url: `https://www.facebook.com/${postId}`, postId };
}

export async function publishFbPagePhoto(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string
): Promise<FbPagePublishResult> {
  const body = { url: imageUrl, caption, access_token: pageToken };
  const res = await fetch(`${GRAPH}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; post_id?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(`fb_page_photo_${res.status}: ${json.error?.message ?? ""}`);
  }
  const postId = (json.post_id ?? json.id)!;
  return { url: `https://www.facebook.com/${postId}`, postId };
}
