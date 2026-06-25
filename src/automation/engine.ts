import { getValidMetaAuth } from "../token-refresher";
import { getPageId } from "../auth/meta";
import { replyToIgComment, sendIgDM, likeIgComment } from "../adapters/instagram";
import type { PlatformAuthStore } from "../schema";
import type { AutomationRuleStore } from "./types";

function pickRandom(arr: string[]): string | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface CommentEventDeps {
  authStore: PlatformAuthStore;
  ruleStore: AutomationRuleStore;
}

export async function processCommentEvent(
  event: { commentId: string; mediaId: string; commentText: string; fromUsername: string },
  deps: CommentEventDeps
): Promise<{ handled: boolean; action?: string }> {
  const { commentId, mediaId, commentText } = event;

  const rules = await deps.ruleStore.getActiveRulesForPost(mediaId);
  if (!rules.length) return { handled: false };

  const lowerText = commentText.toLowerCase().trim();
  const matchedRule = rules.find((rule) =>
    rule.keywords.some((kw) => lowerText.includes(kw.toLowerCase()))
  );
  if (!matchedRule) return { handled: false };

  const auth = await getValidMetaAuth("default", deps.authStore);
  if (!auth) throw new Error("ig_no_token: reconnect Instagram in Social Dispatch");
  const token = auth.tokens.access_token as string;
  const { pageId, pageToken } = await getPageId(token, {
    preferredPageId: typeof auth.tokens.page_id === "string" ? auth.tokens.page_id : undefined,
    preferredIgUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
    preferredIgUsername: typeof auth.tokens.ig_username === "string" ? auth.tokens.ig_username : undefined,
  });

  // Like the triggering comment (best-effort, non-critical)
  try {
    await likeIgComment(commentId, token);
  } catch {
    // Intentionally swallowed - liking is a nice-to-have engagement signal
  }

  if (matchedRule.followGate) {
    try {
      await sendIgDM(pageId, commentId, matchedRule.dmTemplate, pageToken);
      return { handled: true, action: "dm_sent" };
    } catch (err: unknown) {
      // Instagram blocks DMs to non-followers. Fall back to public reply prompting follow.
      const msg = (err as Error)?.message ?? "";
      if (
        msg.includes("200") ||
        msg.includes("551") ||
        msg.includes("not_reachable") ||
        msg.includes("OAuthException")
      ) {
        const gateReply =
          matchedRule.followGateReply || "Follow us and comment again to get the link via DM!";
        await replyToIgComment(commentId, gateReply, token);
        return { handled: true, action: "follow_gate_reply" };
      }
      throw err;
    }
  }

  await sendIgDM(pageId, commentId, matchedRule.dmTemplate, pageToken);

  const publicReply = pickRandom(matchedRule.replyPool);
  if (publicReply) {
    await replyToIgComment(commentId, publicReply, token);
  }

  return { handled: true, action: "dm_sent" };
}
