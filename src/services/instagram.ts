import {
  getInstagramUserFollowStatus,
  likeIgComment,
  publishIgCarousel,
  publishIgImage,
  publishIgReel,
  replyToIgComment,
  sendIgMessage,
} from "../adapters/instagram";
import { getValidMetaAuth } from "../token-refresher";
import { getAccountAnalytics, getAccountSummary, getPostDetails, getRecentPosts } from "../owned-profile/service";
import type {
  OwnedSocialAnalytics,
  OwnedSocialPostDetails,
  OwnedSocialPostDetailsInput,
  OwnedSocialRecentPostsInput,
  OwnedSocialAccountInput,
  PlatformAuthStore,
} from "../schema";
import type { InstagramServiceDeps } from "./types";

export interface InstagramPublishInput {
  accountId: string;
  username?: string;
  mediaUrls: string[];
  caption: string;
}

export interface InstagramService {
  publish(input: InstagramPublishInput): Promise<{ mediaId: string; url: string }>;
  replyToComment(input: { accountId: string; commentId: string; message: string }): Promise<void>;
  sendDm(input: {
    accountId: string;
    recipient: { id?: string; commentId?: string };
    message: string | { text: string; quickReplies?: Array<{ title: string; payload: string }> };
  }): Promise<void>;
  likeComment(input: { accountId: string; commentId: string }): Promise<void>;
  getFollowerStatus(input: { accountId: string; senderId: string }): Promise<boolean>;
  getAccount(input: { accessToken: string; handle: string }): ReturnType<typeof getAccountSummary>;
  getAnalytics(input: OwnedSocialAccountInput): Promise<OwnedSocialAnalytics>;
  getRecentPosts(input: OwnedSocialRecentPostsInput): Promise<Awaited<ReturnType<typeof getRecentPosts>>>;
  getPostDetails(input: OwnedSocialPostDetailsInput): Promise<OwnedSocialPostDetails>;
}

async function getMetaAuth(authStore: PlatformAuthStore, accountId: string) {
  const auth = await getValidMetaAuth(accountId, authStore);
  if (!auth) throw new Error("instagram_auth_missing");
  const accessToken = auth.tokens.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new Error("instagram_access_token_missing");
  return { auth, accessToken };
}

export function createInstagramService(deps: InstagramServiceDeps): InstagramService {
  return {
    async publish({ accountId, username, mediaUrls, caption }) {
      if (mediaUrls.length === 0) throw new Error("instagram_media_missing");
      const { accessToken, auth } = await getMetaAuth(deps.authStore, accountId);
      const igUserId = await deps.resolveInstagramUserId({
        accessToken,
        preferredUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
        username,
      });
      if (mediaUrls.length > 1) return publishIgCarousel(igUserId, accessToken, mediaUrls, caption);
      const mediaUrl = mediaUrls[0];
      if (/\.(mp4|mov|avi)$/i.test(mediaUrl)) return publishIgReel(igUserId, accessToken, mediaUrl, caption);
      return publishIgImage(igUserId, accessToken, mediaUrl, caption);
    },
    async replyToComment({ accountId, commentId, message }) {
      const { accessToken } = await getMetaAuth(deps.authStore, accountId);
      await replyToIgComment(commentId, message, accessToken);
    },
    async sendDm({ accountId, recipient, message }) {
      const { accessToken, auth } = await getMetaAuth(deps.authStore, accountId);
      const page = await deps.resolveMetaPage({
        accessToken,
        preferredPageId: typeof auth.tokens.page_id === "string" ? auth.tokens.page_id : undefined,
        preferredUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
        preferredUsername: typeof auth.tokens.ig_username === "string" ? auth.tokens.ig_username : undefined,
      });
      await sendIgMessage(page.pageId, recipient, message, page.pageToken);
    },
    async likeComment({ accountId, commentId }) {
      const { accessToken } = await getMetaAuth(deps.authStore, accountId);
      await likeIgComment(commentId, accessToken);
    },
    async getFollowerStatus({ accountId, senderId }) {
      const { accessToken, auth } = await getMetaAuth(deps.authStore, accountId);
      const page = await deps.resolveMetaPage({
        accessToken,
        preferredPageId: typeof auth.tokens.page_id === "string" ? auth.tokens.page_id : undefined,
        preferredUserId: typeof auth.tokens.ig_user_id === "string" ? auth.tokens.ig_user_id : undefined,
        preferredUsername: typeof auth.tokens.ig_username === "string" ? auth.tokens.ig_username : undefined,
      });
      return getInstagramUserFollowStatus(senderId, page.pageToken);
    },
    async getAccount(input) {
      return getAccountSummary("instagram", input);
    },
    async getAnalytics(input) {
      return getAccountAnalytics("instagram", input);
    },
    async getRecentPosts(input) {
      return getRecentPosts("instagram", input);
    },
    async getPostDetails(input) {
      return getPostDetails("instagram", input);
    },
  };
}
