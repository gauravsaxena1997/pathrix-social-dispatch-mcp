import { randomBytes } from "crypto";
import { getValidMetaAuth } from "../token-refresher";
import { getPageId } from "../auth/meta";
import {
  CommentAutomationAction,
  DEFAULT_FOLLOW_GATE_INITIAL_TEMPLATE,
  DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE,
  FOLLOW_GATE_RECHECK_PREFIX,
} from "./constants";
import {
  getInstagramUserFollowStatus,
  likeIgComment,
  replyToIgComment,
  sendIgDM,
  sendIgMessage,
  sendIgQuickReply,
} from "../adapters/instagram";
import type { AutomationRuleStore, FollowGateFlow, FollowGateFlowStore } from "./types";
import type { CommentAutomationAction as CommentAutomationActionType } from "./constants";
import type { PlatformAuthStore } from "../schema";

const FOLLOW_GATE_BUTTON_TITLE = "I follow";
const FOLLOW_GATE_FLOW_TTL_MS = 24 * 60 * 60 * 1000;

function pickRandom(arr: string[]): string | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeInstagramUsername(username: string): string {
  return username.replace(/^@+/, "").trim().match(/^[A-Za-z0-9._]+$/)?.[0] ?? "";
}

function formatPublicReplyForCommenter(reply: string, fromUsername: string): string {
  const username = normalizeInstagramUsername(fromUsername);
  if (!username) return reply;
  const mention = `@${username}`;
  return reply.trim().toLowerCase().startsWith(mention.toLowerCase())
    ? reply
    : `${mention} ${reply}`;
}

function normalizeKeywordMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createFlowToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface CommentEventDeps {
  authStore: PlatformAuthStore;
  ruleStore: AutomationRuleStore;
  flowStore?: FollowGateFlowStore;
}

async function resolvePageAuth(authStore: PlatformAuthStore) {
  const auth = await getValidMetaAuth("default", authStore);
  if (!auth) throw new Error("ig_no_token: reconnect Instagram in Social Dispatch");

  const token = auth.tokens.access_token as string;
  const binding = await getPageId(token, {
    preferredPageId: typeof auth.tokens.page_id === "string" ? auth.tokens.page_id : undefined,
    preferredIgUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
    preferredIgUsername: typeof auth.tokens.ig_username === "string" ? auth.tokens.ig_username : undefined,
  });

  return { token, ...binding };
}

async function createFollowGateFlow(
  event: { commentId: string; mediaId: string; senderId: string },
  ruleId: string,
  resourceDmText: string,
  followGateRetryTemplate: string,
  flowStore: FollowGateFlowStore,
) {
  return flowStore.create({
    token: createFlowToken(),
    senderId: event.senderId,
    commentId: event.commentId,
    mediaId: event.mediaId,
    ruleId,
    resourceDmText,
    followGateRetryTemplate,
    expiresAt: new Date(Date.now() + FOLLOW_GATE_FLOW_TTL_MS),
  });
}

async function deliverFlowResource(
  pageId: string,
  recipient: { id?: string; commentId?: string },
  flow: FollowGateFlow,
  pageToken: string,
  flowStore: FollowGateFlowStore,
): Promise<boolean> {
  const claimed = await flowStore.claimResourceDelivery(flow.token);
  if (!claimed) return false;
  try {
    await sendIgMessage(pageId, recipient, flow.resourceDmText, pageToken);
    await flowStore.markCompleted(flow.token);
    return true;
  } catch (error: unknown) {
    await flowStore.releaseResourceDelivery(flow.token);
    throw error;
  }
}

export async function processCommentEvent(
  event: {
    commentId: string;
    mediaId: string;
    commentText: string;
    fromUsername: string;
    fromId?: string;
  },
  deps: CommentEventDeps,
): Promise<{ handled: boolean; action?: CommentAutomationActionType; matchedRuleId?: string }> {
  const { commentId, mediaId, commentText, fromId, fromUsername } = event;
  const rules = await deps.ruleStore.getActiveRulesForPost(mediaId);
  if (!rules.length) return { handled: false };

  const normalizedText = normalizeKeywordMatchText(commentText);
  const matchedRule = rules.find((rule) => {
    if (rule.triggerMode === "ANY_COMMENT") return normalizedText.length > 0;
    return rule.keywords.some((keyword) => {
      const normalizedKeyword = normalizeKeywordMatchText(keyword);
      return normalizedKeyword.length > 0 && normalizedText.includes(normalizedKeyword);
    });
  });
  if (!matchedRule) return { handled: false };
  if (!matchedRule.dmTemplate.trim()) {
    throw new Error(`ig_missing_resource: rule ${matchedRule.id} has no resource DM`);
  }

  const publicReplyPool = matchedRule.replyPool.length
    ? matchedRule.replyPool
    : await deps.ruleStore.getGlobalReplyPool?.() ?? [];

  const { token, pageId, pageToken } = await resolvePageAuth(deps.authStore);

  try {
    await likeIgComment(commentId, token);
  } catch {
    // Liking is best effort and must not block delivery.
  }

  if (matchedRule.followGate) {
    if (!fromId) throw new Error("ig_missing_sender_id: follow gate requires an Instagram-scoped sender id");
    if (!deps.flowStore) throw new Error("ig_missing_flow_store: follow gate flow storage is not configured");

    const flow = await createFollowGateFlow(
      { commentId, mediaId, senderId: fromId },
      matchedRule.id,
      matchedRule.dmTemplate,
      matchedRule.followGateRetryTemplate || DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE,
      deps.flowStore,
    );
    let followsBusiness = false;
    try {
      followsBusiness = await getInstagramUserFollowStatus(fromId, pageToken);
    } catch {
      // A commenter may not have granted profile consent yet. The one-time
      // gate message gives them the messaging interaction needed for retry.
      followsBusiness = false;
    }

    if (followsBusiness) {
      const delivered = await deliverFlowResource(pageId, { commentId }, flow, pageToken, deps.flowStore);
      const publicReply = pickRandom(publicReplyPool);
      if (publicReply) await replyToIgComment(commentId, formatPublicReplyForCommenter(publicReply, fromUsername), token);
      return {
        handled: true,
        action: delivered ? CommentAutomationAction.DM_SENT : CommentAutomationAction.NONE,
        matchedRuleId: matchedRule.id,
      };
    }

    await sendIgQuickReply(
      pageId,
      { commentId },
      matchedRule.followGateInitialTemplate || DEFAULT_FOLLOW_GATE_INITIAL_TEMPLATE,
      FOLLOW_GATE_BUTTON_TITLE,
      `${FOLLOW_GATE_RECHECK_PREFIX}${flow.token}`,
      pageToken,
    );
    const publicReply = pickRandom(publicReplyPool);
    if (publicReply) await replyToIgComment(commentId, formatPublicReplyForCommenter(publicReply, fromUsername), token);
    return { handled: true, action: CommentAutomationAction.FOLLOW_GATE_SENT, matchedRuleId: matchedRule.id };
  }

  await sendIgDM(pageId, commentId, matchedRule.dmTemplate, pageToken);
  const publicReply = pickRandom(publicReplyPool);
  if (publicReply) await replyToIgComment(commentId, formatPublicReplyForCommenter(publicReply, fromUsername), token);

  return {
    handled: true,
    action: publicReply ? CommentAutomationAction.PUBLIC_REPLY : CommentAutomationAction.DM_SENT,
    matchedRuleId: matchedRule.id,
  };
}

export async function processDirectMessageEvent(
  event: {
    messageId: string;
    senderId: string;
    threadId?: string;
    messageText: string;
    senderUsername: string;
    quickReplyPayload?: string;
  },
  deps: CommentEventDeps,
): Promise<{ handled: boolean; action?: CommentAutomationActionType; matchedRuleId?: string }> {
  void event.messageId;
  void event.threadId;
  void event.messageText;
  void event.senderUsername;

  const payload = event.quickReplyPayload;
  if (!payload?.startsWith(FOLLOW_GATE_RECHECK_PREFIX) || !deps.flowStore) {
    return { handled: false };
  }

  const token = payload.slice(FOLLOW_GATE_RECHECK_PREFIX.length);
  const flow = await deps.flowStore.getByToken(token);
  if (!flow || flow.senderId !== event.senderId || flow.status !== "PENDING" || flow.expiresAt.getTime() <= Date.now()) {
    return { handled: false };
  }

  const { pageId, pageToken } = await resolvePageAuth(deps.authStore);
  let followsBusiness = false;
  try {
    followsBusiness = await getInstagramUserFollowStatus(event.senderId, pageToken);
  } catch {
    // Keep the resource protected and ask for another explicit recheck.
    followsBusiness = false;
  }
  if (followsBusiness) {
    const delivered = await deliverFlowResource(pageId, { id: event.senderId }, flow, pageToken, deps.flowStore);
    return {
      handled: true,
      action: delivered ? CommentAutomationAction.DM_SENT : CommentAutomationAction.NONE,
      matchedRuleId: flow.ruleId,
    };
  }

  await sendIgQuickReply(
    pageId,
    { id: event.senderId },
    flow.followGateRetryTemplate || DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE,
    FOLLOW_GATE_BUTTON_TITLE,
    `${FOLLOW_GATE_RECHECK_PREFIX}${flow.token}`,
    pageToken,
  );
  await deps.flowStore.incrementRetry(flow.token);
  return { handled: true, action: CommentAutomationAction.FOLLOW_GATE_RETRY_SENT, matchedRuleId: flow.ruleId };
}
