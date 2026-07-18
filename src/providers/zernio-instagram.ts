import Zernio from "@zernio/node";
import type { InstagramAutomationTransport } from "../automation/types";

type ConversationSummary = {
  id?: string;
  participantId?: string;
  instagramProfile?: { isFollower?: boolean | null } | null;
};

type InstagramProfile = {
  isFollower?: boolean | null;
  fetchedAt?: string | null;
};

type ConversationDetailResponse = {
  data?: { participantId?: string; instagramProfile?: InstagramProfile | null };
};

type ConversationListResponse = {
  data?: ConversationSummary[];
  pagination?: { hasMore?: boolean; nextCursor?: string | null };
};

type InstagramStorySummary = {
  id: string;
  mediaType?: string | null;
  mediaProductType?: string | null;
  mediaUrl?: string | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
  timestamp?: string | null;
};

type ListInstagramStoriesResponse = { data?: InstagramStorySummary[] };

export type ActiveInstagramStory = {
  id: string;
  mediaType: string | null;
  mediaProductType: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: string | null;
};

export function resolveFreshFollowerStatus(
  profile: InstagramProfile | null | undefined,
  freshAfter: Date,
): boolean | null {
  if (typeof profile?.isFollower !== "boolean" || !profile.fetchedAt) return null;
  const fetchedAt = new Date(profile.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime()) || fetchedAt < freshAfter) return null;
  return profile.isFollower;
}

function getAccountId(accountId?: string): string {
  const resolved = accountId?.trim() || process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID?.trim();
  if (!resolved) throw new Error("zernio_missing_instagram_account_id");
  return resolved;
}

function getClient(apiKey?: string): Zernio {
  const resolved = apiKey?.trim() || process.env.ZERNIO_API_KEY?.trim();
  if (!resolved) throw new Error("zernio_missing_api_key");
  return new Zernio({ apiKey: resolved });
}

export function createZernioInstagramTransport(options?: {
  accountId?: string;
  apiKey?: string;
}): InstagramAutomationTransport {
  const accountId = getAccountId(options?.accountId);
  const client = getClient(options?.apiKey);
  return {
    provider: "zernio",
    async findConversation({ participantId }) {
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const result = await client.messages.listInboxConversations({
          query: { accountId, platform: "instagram", limit: 100, cursor },
        });
        const response = result.data as ConversationListResponse | undefined;
        const conversation = response?.data?.find((item) => item.participantId === participantId);
        if (conversation?.id) {
          return { conversationId: conversation.id, isFollower: conversation.instagramProfile?.isFollower };
        }
        if (!response?.pagination?.hasMore || !response.pagination.nextCursor) return null;
        cursor = response.pagination.nextCursor;
      }
      return null;
    },
    async getFollowerStatus({ senderId, conversationId, freshAfter }) {
      const result = await client.messages.getInboxConversation({
        path: { conversationId },
        query: { accountId },
      });
      const conversation = (result.data as ConversationDetailResponse | undefined)?.data;
      if (conversation?.participantId && conversation.participantId !== senderId) return null;
      return resolveFreshFollowerStatus(conversation?.instagramProfile, freshAfter);
    },
    async sendPrivateReply({ postId, commentId, message, buttons }) {
      await client.comments.sendPrivateReplyToComment({
        path: { postId, commentId },
        body: { accountId, message, buttons },
      });
    },
    async sendConversationMessage({ conversationId, message }) {
      await client.messages.sendInboxMessage({ path: { conversationId }, body: { accountId, message } });
    },
    async sendConversationButton({ conversationId, message, title, payload }) {
      await client.messages.sendInboxMessage({
        path: { conversationId },
        body: { accountId, message, buttons: [{ type: "postback", title, payload }] },
      });
    },
    async replyToComment({ postId, commentId, message }) {
      await client.comments.replyToInboxPost({
        path: { postId },
        body: { accountId, commentId, message },
      });
    },
  };
}

export async function listActiveInstagramStories(options?: {
  accountId?: string;
  apiKey?: string;
}): Promise<ActiveInstagramStory[]> {
  const result = await getClient(options?.apiKey).instagram.listInstagramStories({
    path: { accountId: getAccountId(options?.accountId) },
  });
  const response = result.data as ListInstagramStoriesResponse | undefined;
  return (response?.data ?? []).map((story) => ({
    id: story.id,
    mediaType: story.mediaType ?? null,
    mediaProductType: story.mediaProductType ?? null,
    mediaUrl: story.mediaUrl ?? null,
    permalink: story.permalink ?? null,
    thumbnailUrl: story.thumbnailUrl ?? null,
    timestamp: story.timestamp ?? null,
  }));
}
