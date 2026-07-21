import { randomBytes } from "crypto";

import { getPageId } from "../auth/meta";
import {
  likeIgComment,
  replyToIgComment,
  sendIgDM,
  sendIgMessage,
  sendIgQuickReply,
} from "../adapters/instagram";
import { getValidMetaAuth } from "../token-refresher";
import {
  CommentAutomationAction,
  DEFAULT_FOLLOW_GATE_INITIAL_TEMPLATE,
  DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE,
  FOLLOWER_STATUS_FRESHNESS_WINDOW_MS,
  FOLLOW_GATE_RECHECK_PREFIX,
} from "../automation/constants";
import type {
  AutomationRuleStore,
  FollowGateFlow,
  FollowGateFlowStore,
} from "../automation/types";
import type { PlatformAuthStore } from "../schema";
import type { InstagramFollowerStatusProvider } from "../providers/zernio-follower-status";

const FOLLOW_GATE_BUTTON_TITLE = "I follow";
const FOLLOW_GATE_FLOW_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GLOBAL_COMMENT_KEYWORDS = ["link", "resource"];

function pickRandom(values: string[]): string | undefined {
  if (!values.length) return undefined;
  return values[Math.floor(Math.random() * values.length)];
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

export interface HybridInstagramAutomationDeps {
  authStore: PlatformAuthStore;
  ruleStore: AutomationRuleStore;
  flowStore?: FollowGateFlowStore;
  followerStatus: InstagramFollowerStatusProvider;
}

async function resolvePageAuth(authStore: PlatformAuthStore) {
  const auth = await getValidMetaAuth("default", authStore);
  if (!auth) throw new Error("ig_no_token: reconnect Instagram in Social Dispatch");
  const token = auth.tokens.access_token;
  if (typeof token !== "string" || !token) throw new Error("instagram_access_token_missing");
  const binding = await getPageId(token, {
    preferredPageId: typeof auth.tokens.page_id === "string" ? auth.tokens.page_id : undefined,
    preferredIgUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
    preferredIgUsername: typeof auth.tokens.ig_username === "string" ? auth.tokens.ig_username : undefined,
  });
  return { token, ...binding };
}

async function resolveFollowGateTemplates(ruleStore: AutomationRuleStore) {
  const templates = await ruleStore.getGlobalFollowGateTemplates?.();
  return {
    initialTemplate: templates?.initialTemplate?.trim() || DEFAULT_FOLLOW_GATE_INITIAL_TEMPLATE,
    retryTemplate: templates?.retryTemplate?.trim() || DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE,
  };
}

async function resolveGlobalDefaultKeywords(ruleStore: AutomationRuleStore): Promise<string[]> {
  const configuredKeywords = await ruleStore.getGlobalDefaultKeywords?.();
  const keywords = configuredKeywords?.length ? configuredKeywords : DEFAULT_GLOBAL_COMMENT_KEYWORDS;
  return keywords
    .map((keyword) => normalizeKeywordMatchText(keyword))
    .filter((keyword, index, values) => keyword.length > 0 && values.indexOf(keyword) === index);
}

async function createFollowGateFlow(
  event: { commentId: string; mediaId: string; senderId: string; conversationId?: string },
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
    conversationId: event.conversationId,
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

export function createHybridInstagramAutomationService(deps: HybridInstagramAutomationDeps) {
  async function processCommentEvent(event: {
    commentId: string;
    mediaId: string;
    commentText: string;
    fromUsername: string;
    fromId?: string;
    conversationId?: string;
    eventType?: "comment" | "story_reply";
  }): Promise<{ handled: boolean; action?: typeof CommentAutomationAction[keyof typeof CommentAutomationAction]; matchedRuleId?: string }> {
    const eventType = event.eventType ?? "comment";
    const isStoryReply = eventType === "story_reply";
    const rules = await deps.ruleStore.getActiveRulesForPost(event.mediaId);
    const normalizedText = normalizeKeywordMatchText(event.commentText);
    const globalKeywords = await resolveGlobalDefaultKeywords(deps.ruleStore);
    const matchedRule = rules.find((rule) => {
      if (isStoryReply) {
        if (rule.triggerMode === "ANY_STORY_REPLY") return normalizedText.length > 0;
        if (rule.triggerMode !== "STORY_REPLY") return false;
      } else {
        if (rule.triggerMode === "ANY_COMMENT") return normalizedText.length > 0;
        if (rule.triggerMode !== "KEYWORDS") return false;
      }
      return [...rule.keywords, ...globalKeywords].some((keyword) => {
        const normalizedKeyword = normalizeKeywordMatchText(keyword);
        return normalizedKeyword.length > 0 && normalizedText.includes(normalizedKeyword);
      });
    });
    if (!matchedRule) return { handled: false };
    if (!matchedRule.dmTemplate.trim()) throw new Error(`ig_missing_resource: rule ${matchedRule.id} has no resource DM`);
    if (!event.fromId) throw new Error("ig_missing_sender_id: hybrid follow gate requires an Instagram sender id");
    if (!deps.flowStore) throw new Error("ig_missing_flow_store: follow gate flow storage is not configured");

    const { token, pageId, pageToken } = await resolvePageAuth(deps.authStore);
    if (!isStoryReply) {
      try {
        await likeIgComment(event.commentId, token);
      } catch {
        // Liking is best effort and must not block delivery.
      }
    }

    const replyPool = matchedRule.replyPool.length
      ? matchedRule.replyPool
      : await deps.ruleStore.getGlobalReplyPool?.() ?? [];
    const publicReply = pickRandom(replyPool);

    if (matchedRule.followGate) {
      const templates = await resolveFollowGateTemplates(deps.ruleStore);
      const flow = await createFollowGateFlow(
        {
          commentId: event.commentId,
          mediaId: event.mediaId,
          senderId: event.fromId,
          conversationId: event.conversationId,
        },
        matchedRule.id,
        matchedRule.dmTemplate,
        templates.retryTemplate,
        deps.flowStore,
      );
      const gateMessage = {
        text: templates.initialTemplate,
        quickReplies: [{ title: FOLLOW_GATE_BUTTON_TITLE, payload: `${FOLLOW_GATE_RECHECK_PREFIX}${flow.token}` }],
      };
      if (isStoryReply) {
        await sendIgMessage(pageId, { id: event.fromId }, gateMessage, pageToken);
      } else {
        await sendIgQuickReply(pageId, { commentId: event.commentId }, templates.initialTemplate, FOLLOW_GATE_BUTTON_TITLE, `${FOLLOW_GATE_RECHECK_PREFIX}${flow.token}`, pageToken);
      }
      if (publicReply && !isStoryReply) {
        await replyToIgComment(event.commentId, formatPublicReplyForCommenter(publicReply, event.fromUsername), token);
      }
      return { handled: true, action: CommentAutomationAction.FOLLOW_GATE_SENT, matchedRuleId: matchedRule.id };
    }

    if (isStoryReply) {
      await sendIgMessage(pageId, { id: event.fromId }, matchedRule.dmTemplate, pageToken);
    } else {
      await sendIgDM(pageId, event.commentId, matchedRule.dmTemplate, pageToken);
      if (publicReply) {
        await replyToIgComment(event.commentId, formatPublicReplyForCommenter(publicReply, event.fromUsername), token);
      }
    }
    return {
      handled: true,
      action: publicReply && !isStoryReply ? CommentAutomationAction.PUBLIC_REPLY : CommentAutomationAction.DM_SENT,
      matchedRuleId: matchedRule.id,
    };
  }

  async function processDirectMessageEvent(event: {
    messageId: string;
    senderId: string;
    threadId?: string;
    messageText: string;
    senderUsername: string;
    quickReplyPayload?: string;
    conversationId?: string;
    receivedAt?: Date;
  }): Promise<{ handled: boolean; action?: typeof CommentAutomationAction[keyof typeof CommentAutomationAction]; matchedRuleId?: string }> {
    void event.messageId;
    void event.threadId;
    void event.messageText;
    void event.senderUsername;
    const payload = event.quickReplyPayload;
    if (!payload?.startsWith(FOLLOW_GATE_RECHECK_PREFIX) || !deps.flowStore) return { handled: false };
    const token = payload.slice(FOLLOW_GATE_RECHECK_PREFIX.length);
    const flow = await deps.flowStore.getByToken(token);
    if (!flow || flow.senderId !== event.senderId || flow.status !== "PENDING" || flow.expiresAt.getTime() <= Date.now()) {
      return { handled: false };
    }
    if (!event.conversationId) throw new Error("ig_missing_conversation_id: Zernio message has no conversation");
    const templates = await resolveFollowGateTemplates(deps.ruleStore);
    const receivedAt = event.receivedAt ?? new Date();
    let followsBusiness: boolean | null = null;
    try {
      followsBusiness = await deps.followerStatus.getFollowerStatus({
        senderId: event.senderId,
        conversationId: event.conversationId,
        freshAfter: new Date(receivedAt.getTime() - FOLLOWER_STATUS_FRESHNESS_WINDOW_MS),
      });
    } catch {
      // Follower lookup failures fail closed and keep the resource protected.
    }
    const { pageId, pageToken } = await resolvePageAuth(deps.authStore);
    if (followsBusiness === true) {
      const delivered = await deliverFlowResource(pageId, { id: event.senderId }, flow, pageToken, deps.flowStore);
      return { handled: true, action: delivered ? CommentAutomationAction.DM_SENT : CommentAutomationAction.NONE, matchedRuleId: flow.ruleId };
    }
    if (flow.retryCount >= 3) {
      await deps.flowStore.expire?.(flow.token);
      return { handled: true, action: CommentAutomationAction.NONE, matchedRuleId: flow.ruleId };
    }
    await sendIgQuickReply(pageId, { id: event.senderId }, templates.retryTemplate, FOLLOW_GATE_BUTTON_TITLE, `${FOLLOW_GATE_RECHECK_PREFIX}${flow.token}`, pageToken);
    await deps.flowStore.incrementRetry(flow.token);
    return { handled: true, action: CommentAutomationAction.FOLLOW_GATE_RETRY_SENT, matchedRuleId: flow.ruleId };
  }

  return { processCommentEvent, processDirectMessageEvent };
}
