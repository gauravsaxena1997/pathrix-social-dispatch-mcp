import crypto from "crypto";
import type { CommentEventDeps } from "../automation/engine";
import { processCommentEvent, processDirectMessageEvent } from "../automation/engine";
import { CommentAutomationEventStatus } from "../automation/constants";
import type {
  CommentAutomationLedgerStore,
  CommentAutomationEventInput,
} from "../automation/types";

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
  messaging?: Array<IgMessagingEvent>;
}

interface IgMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
  };
}

interface IgWebhookPayload {
  object?: string;
  entry?: IgWebhookEntry[];
}

// ─── Webhook POST handler ─────────────────────────────────────────────────────

export interface InstagramWebhookDeps extends CommentEventDeps {
  appSecret?: string;
  ledgerStore?: CommentAutomationLedgerStore;
  flowStore?: CommentEventDeps["flowStore"];
  senderProfileResolver?: (senderId: string) => Promise<string | null>;
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
      // Meta's live Instagram comment webhook payloads include the comment
      // object but do not reliably include `verb`. Treat the comments event
      // itself as the add signal and only skip malformed values.
      if (!v) continue;

      const commentId = v.id;
      const mediaId = v.media?.id;
      const commentText = v.text;
      const fromUsername = v.from?.username ?? "";

      if (!commentId || !mediaId || !commentText) continue;

      const eventKey = `instagram:comment:${mediaId}:${commentId}`;
      const incomingEvent: CommentAutomationEventInput = {
        eventKey,
        eventType: "comment",
        mediaId,
        commentId,
        commentText,
        fromUsername,
        fromId: v.from?.id,
        payloadJson: rawBody,
      };
      const claimed = deps.ledgerStore ? await deps.ledgerStore.claimIncomingComment(incomingEvent) : true;
      if (!claimed) {
        processed.push(`${commentId}:duplicate`);
        if (deps.ledgerStore) {
          await deps.ledgerStore.markCommentOutcome({
            eventKey,
            status: CommentAutomationEventStatus.DUPLICATE,
          });
        }
        continue;
      }

      try {
        const result = await processCommentEvent(
          { commentId, mediaId, commentText, fromUsername, fromId: v.from?.id },
          deps
        );
        if (deps.ledgerStore) {
          await deps.ledgerStore.markCommentOutcome({
            eventKey,
            status: result.handled ? CommentAutomationEventStatus.PROCESSED : CommentAutomationEventStatus.SKIPPED,
            action: result.action,
            matchedRuleId: result.matchedRuleId,
          });
        }
        if (result.handled) {
          processed.push(`${commentId}:${result.action}`);
        } else {
          processed.push(`${commentId}:skipped`);
        }
      } catch (err: unknown) {
        // Never let a handler error cause a non-200 response - Meta retries aggressively
        if (deps.ledgerStore) {
          await deps.ledgerStore.markCommentOutcome({
            eventKey,
            status: CommentAutomationEventStatus.FAILED,
            failureReason: (err as Error)?.message,
          });
        }
        console.error("ig_webhook_comment_error", {
          commentId,
          error: (err as Error)?.message,
        });
      }
    }

    for (const messaging of entry.messaging ?? []) {
      const senderId = messaging.sender?.id;
      const messageId = messaging.message?.mid;
      const messageText = messaging.message?.text;
      const quickReplyPayload = messaging.message?.quick_reply?.payload;
      if (!senderId || !messageId || (!messageText && !quickReplyPayload) || messaging.message?.is_echo) continue;

      const eventKey = `instagram:message:${senderId}:${messageId}`;
      let resolvedUsername: string | null = null;
      if (deps.senderProfileResolver) {
        try {
          resolvedUsername = await deps.senderProfileResolver(senderId);
        } catch {
          resolvedUsername = null;
        }
      }
      const incomingEvent: CommentAutomationEventInput = {
        eventKey,
        eventType: "message",
        mediaId: entry.id ?? senderId,
        messageId,
        commentText: messageText ?? "",
        fromUsername: resolvedUsername ?? senderId,
        senderResolvedUsername: resolvedUsername ?? undefined,
        fromId: senderId,
        threadId: messaging.recipient?.id,
        payloadJson: rawBody,
      };
      const claimed = deps.ledgerStore
        ? deps.ledgerStore.claimIncomingMessage
          ? await deps.ledgerStore.claimIncomingMessage(incomingEvent)
          : await deps.ledgerStore.claimIncomingComment(incomingEvent)
        : true;
      if (!claimed) {
        processed.push(`${messageId}:duplicate`);
        if (deps.ledgerStore?.markMessageOutcome) {
          await deps.ledgerStore.markMessageOutcome({
            eventKey,
            eventType: "message",
            status: CommentAutomationEventStatus.DUPLICATE,
          });
        }
        continue;
      }

      try {
        const result = await processDirectMessageEvent(
          {
            messageId,
            senderId,
            threadId: messaging.recipient?.id,
            messageText: messageText ?? "",
            senderUsername: resolvedUsername ?? senderId,
            quickReplyPayload,
          },
          deps
        );
        if (deps.ledgerStore?.markMessageOutcome) {
          await deps.ledgerStore.markMessageOutcome({
            eventKey,
            eventType: "message",
            status: result.handled ? CommentAutomationEventStatus.PROCESSED : CommentAutomationEventStatus.SKIPPED,
            action: result.action,
            matchedRuleId: result.matchedRuleId,
          });
        }
        processed.push(`${messageId}:${result.action ?? "skipped"}`);
      } catch (err: unknown) {
        if (deps.ledgerStore?.markMessageOutcome) {
          await deps.ledgerStore.markMessageOutcome({
            eventKey,
            eventType: "message",
            status: CommentAutomationEventStatus.FAILED,
            failureReason: (err as Error)?.message,
          });
        }
        console.error("ig_webhook_message_error", {
          messageId,
          error: (err as Error)?.message,
        });
      }
    }
  }

  return { ok: true, processed };
}
