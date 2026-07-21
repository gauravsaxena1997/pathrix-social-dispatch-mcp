import Zernio from "@zernio/node";

type InstagramProfile = {
  isFollower?: boolean | null;
  fetchedAt?: string | null;
};

type ConversationDetailResponse = {
  data?: { participantId?: string; instagramProfile?: InstagramProfile | null };
};

export type InstagramFollowerStatusProvider = {
  getFollowerStatus(input: {
    senderId: string;
    conversationId: string;
    freshAfter: Date;
  }): Promise<boolean | null>;
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

export function createZernioFollowerStatusProvider(options?: {
  accountId?: string;
  apiKey?: string;
}): InstagramFollowerStatusProvider {
  const accountId = getAccountId(options?.accountId);
  const client = getClient(options?.apiKey);
  return {
    async getFollowerStatus({ senderId, conversationId, freshAfter }) {
      const result = await client.messages.getInboxConversation({
        path: { conversationId },
        query: { accountId },
      });
      const conversation = (result.data as ConversationDetailResponse | undefined)?.data;
      if (conversation?.participantId && conversation.participantId !== senderId) return null;
      return resolveFreshFollowerStatus(conversation?.instagramProfile, freshAfter);
    },
  };
}
