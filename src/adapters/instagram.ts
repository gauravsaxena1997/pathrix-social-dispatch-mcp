import { API_ENDPOINTS, POLL_CONFIG } from "../config";
const GRAPH = API_ENDPOINTS.meta;

export type IgMediaType = "IMAGE" | "VIDEO" | "REELS" | "STORIES" | "CAROUSEL_ALBUM";

export interface IgPublishResult {
  url: string;
  mediaId: string;
}

async function graphPost(path: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(`ig_graph_${res.status}: ${err?.message ?? JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  timeoutMs = POLL_CONFIG.ig_container_timeout_ms
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const json = (await res.json()) as { status_code?: string; status?: string };
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`ig_container_${json.status_code}: ${json.status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, POLL_CONFIG.ig_container_poll_interval_ms));
  }
  throw new Error("ig_container_timeout");
}

export async function publishIgImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<IgPublishResult> {
  const container = await graphPost(`${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const containerId = container.id as string;
  const pub = await graphPost(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  const mediaId = pub.id as string;
  return { url: `https://www.instagram.com/p/${mediaId}/`, mediaId };
}

export async function publishIgReel(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string
): Promise<IgPublishResult> {
  const container = await graphPost(`${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
  });
  const containerId = container.id as string;

  // Check for trending audio flag before publishing
  const statusRes = await fetch(
    `${GRAPH}/${containerId}?fields=status_code,status&access_token=${accessToken}`
  );
  const statusJson = (await statusRes.json()) as { status?: string };
  if (statusJson.status?.includes("trending_audio") || statusJson.status?.includes("no_audio")) {
    throw new Error(`ig_manual_required:trending_audio`);
  }

  await pollContainerStatus(containerId, accessToken);

  const pub = await graphPost(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  const mediaId = pub.id as string;
  return { url: `https://www.instagram.com/reel/${mediaId}/`, mediaId };
}

export async function replyToIgComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  await graphPost(`${commentId}/replies`, { message, access_token: accessToken });
}

export async function sendIgDM(
  pageId: string,
  commentId: string,
  message: string,
  pageAccessToken: string
): Promise<void> {
  await sendIgMessage(pageId, { commentId }, message, pageAccessToken);
}

export async function sendIgMessage(
  pageId: string,
  recipient: { id?: string; commentId?: string },
  message: string | { text: string; quickReplies?: Array<{ title: string; payload: string }> },
  pageAccessToken: string
): Promise<void> {
  const recipientPayload = recipient.commentId
    ? { comment_id: recipient.commentId }
    : { id: recipient.id };
  await graphPost(`${pageId}/messages`, {
    recipient: recipientPayload,
    message: typeof message === "string"
      ? { text: message }
      : {
          text: message.text,
          ...(message.quickReplies?.length
            ? {
                quick_replies: message.quickReplies.map((quickReply) => ({
                  content_type: "text",
                  title: quickReply.title,
                  payload: quickReply.payload,
                })),
              }
            : {}),
        },
    access_token: pageAccessToken,
  });
}

export async function sendIgQuickReply(
  pageId: string,
  recipient: { id?: string; commentId?: string },
  text: string,
  title: string,
  payload: string,
  pageAccessToken: string,
): Promise<void> {
  await sendIgMessage(pageId, recipient, { text, quickReplies: [{ title, payload }] }, pageAccessToken);
}

export async function getInstagramUserFollowStatus(
  senderId: string,
  pageAccessToken: string,
): Promise<boolean> {
  const res = await fetch(
    `${GRAPH}/${senderId}?fields=is_user_follow_business&access_token=${pageAccessToken}`,
    { cache: "no-store" },
  );
  const json = await res.json() as { is_user_follow_business?: boolean; error?: { message?: string } };
  if (!res.ok || json.error || typeof json.is_user_follow_business !== "boolean") {
    throw new Error(`ig_follow_status_${res.status}: ${json.error?.message ?? "missing follow status"}`);
  }
  return json.is_user_follow_business;
}

export async function likeIgComment(
  commentId: string,
  accessToken: string
): Promise<void> {
  await graphPost(`${commentId}/likes`, { access_token: accessToken });
}

export async function publishIgCarousel(
  igUserId: string,
  accessToken: string,
  mediaUrls: string[],
  caption: string
): Promise<IgPublishResult> {
  if (mediaUrls.length > 10) throw new Error("ig_carousel_too_many_images: max 10");

  const childIds: string[] = [];
  for (const url of mediaUrls) {
    const isVideo = url.match(/\.(mp4|mov|avi)$/i);
    const child = await graphPost(`${igUserId}/media`, {
      ...(isVideo ? { video_url: url, media_type: "VIDEO" } : { image_url: url }),
      is_carousel_item: "true",
      access_token: accessToken,
    });
    childIds.push(child.id as string);
  }

  const container = await graphPost(`${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: accessToken,
  });
  const containerId = container.id as string;
  await pollContainerStatus(containerId, accessToken);

  const pub = await graphPost(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  const mediaId = pub.id as string;
  return { url: `https://www.instagram.com/p/${mediaId}/`, mediaId };
}
