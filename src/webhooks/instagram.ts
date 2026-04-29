import crypto from "crypto";
import type { CommentEventDeps } from "../automation/engine";
import { processCommentEvent } from "../automation/engine";

// ─── Webhook challenge verification (GET) ────────────────────────────────────

export function verifyInstagramChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string | undefined
): { ok: boolean; challenge?: string } {
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// ─── Webhook payload types ────────────────────────────────────────────────────

interface IgCommentValue {
  from?: { id?: string; username?: string };
  media?: { id?: string };
  id?: string;
  text?: string;
  verb?: string;
}

interface IgWebhookEntry {
  id?: string;
  changes?: Array<{ field?: string; value?: IgCommentValue }>;
}

interface IgWebhookPayload {
  object?: string;
  entry?: IgWebhookEntry[];
}

// ─── Webhook POST handler ─────────────────────────────────────────────────────

export interface InstagramWebhookDeps extends CommentEventDeps {
  appSecret?: string;
}

export interface InstagramWebhookResult {
  ok: boolean;
  processed: string[];
  error?: string;
  status?: number;
}

export async function processInstagramWebhookPayload(
  rawBody: string,
  signature: string | null,
  deps: InstagramWebhookDeps
): Promise<InstagramWebhookResult> {
  // HMAC verification (skip only when appSecret is not configured)
  if (deps.appSecret && signature) {
    const expected =
      "sha256=" + crypto.createHmac("sha256", deps.appSecret).update(rawBody).digest("hex");
    if (signature !== expected) {
      return { ok: false, processed: [], error: "invalid_signature", status: 401 };
    }
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as IgWebhookPayload;
  } catch {
    return { ok: false, processed: [], error: "invalid_json", status: 400 };
  }

  if (payload.object !== "instagram") {
    return { ok: true, processed: [] };
  }

  const processed: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;

      const v = change.value;
      if (!v || v.verb !== "add") continue;

      const commentId = v.id;
      const mediaId = v.media?.id;
      const commentText = v.text;
      const fromUsername = v.from?.username ?? "";

      if (!commentId || !mediaId || !commentText) continue;

      try {
        const result = await processCommentEvent(
          { commentId, mediaId, commentText, fromUsername },
          deps
        );
        if (result.handled) {
          processed.push(`${commentId}:${result.action}`);
        }
      } catch (err: unknown) {
        // Never let a handler error cause a non-200 response - Meta retries aggressively
        console.error("ig_webhook_comment_error", {
          commentId,
          error: (err as Error)?.message,
        });
      }
    }
  }

  return { ok: true, processed };
}
