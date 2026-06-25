export { registerSocialDispatchTools } from "./tools";

// ─── Open event hook ──────────────────────────────────────────────────────────

export type PackageEvent = {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

export type OnEventHook = (e: PackageEvent) => void | Promise<void>;

// Config constants
export { API_ENDPOINTS, POLL_CONFIG, PLATFORM_LIMITS, DISPATCH_CONFIG } from "./config";

// Token refresh (framework-agnostic, requires PlatformAuthStore)
export {
  getValidMetaAuth,
  getValidMetaToken,
  getValidYouTubeToken,
  getValidXToken,
  getValidGmailToken,
  refreshAllTokens,
} from "./token-refresher";

// Auth handler functions (OAuth init + callback logic)
export { initMetaAuth, handleMetaCallback } from "./auth/handlers";
export { initYouTubeAuth, handleYouTubeCallback } from "./auth/handlers";
export { initXAuth, handleXCallback } from "./auth/handlers";
export { initGmailAuth, handleGmailCallback } from "./auth/handlers";
export { initDriveAuth, handleDriveCallback } from "./auth/handlers";

// Adapters
export { publishSelfPost, publishLinkPost, getUserRecentPosts, checkSelfPromoRatio } from "./adapters/reddit";
export { publishIgImage, publishIgReel, publishIgCarousel, replyToIgComment, sendIgDM, likeIgComment } from "./adapters/instagram";
export { publishThreadsPost } from "./adapters/threads";
export { publishFbPagePost, publishFbPagePhoto } from "./adapters/facebook-page";
export { uploadYouTubeVideo, pollYouTubeProcessing } from "./adapters/youtube";
export { publishXTweet, publishXThread, splitIntoThread } from "./adapters/x";

// Auth helpers (low-level OAuth URL generation + code exchange)
export {
  getMetaAuthorizeUrl,
  exchangeMetaCode,
  getLongLivedToken,
  refreshLongLivedToken,
  listMetaPageBindings,
  resolveMetaPageBinding,
  getIgUserId,
  getPageId,
  subscribeAppToPage,
  getThreadsUserId,
} from "./auth/meta";
export { getYouTubeAuthorizeUrl, exchangeYouTubeCode, refreshYouTubeToken } from "./auth/youtube";
export { generatePkce, getXAuthorizeUrl, exchangeXCode, refreshXToken } from "./auth/x";
export { getGmailAuthorizeUrl, exchangeGmailCode, refreshGmailToken } from "./auth/gmail";
export { getDriveAuthorizeUrl, exchangeDriveCode, refreshDriveToken } from "./auth/drive";

// Instagram automation (comment-to-DM engine + webhook handler)
export { processCommentEvent } from "./automation/engine";
export { verifyInstagramChallenge, processInstagramWebhookPayload } from "./webhooks/instagram";
export type { CommentAutomationRule, AutomationRuleStore } from "./automation/types";
export type { CommentEventDeps } from "./automation/engine";
export type { InstagramWebhookDeps, InstagramWebhookResult } from "./webhooks/instagram";

// Owned-account profile scrapers (Instagram Graph API + YouTube Data API v3)
export { getIgUserIdForHandle, scrapeInstagramGraphProfile, fetchIgPendingComments } from "./owned-profile/instagram";
export { fetchYouTubeAnalytics, scrapeYouTubeProfileViaApi, fetchYtPendingComments } from "./owned-profile/youtube";
export {
  getAccountSummary,
  getAccountAnalytics,
  getRecentPosts,
  getPostDetails,
  refreshAccountSnapshot,
} from "./owned-profile/service";

// Types
export type { RedditPostResult } from "./adapters/reddit";
export type { IgPublishResult, IgMediaType } from "./adapters/instagram";
export type { ThreadsPublishResult } from "./adapters/threads";
export type { FbPagePublishResult } from "./adapters/facebook-page";
export type { YouTubePublishResult } from "./adapters/youtube";
export type { XPublishResult } from "./adapters/x";
export type {
  PublishPlatform,
  PublishStatus,
  PublishJob,
  PublishResult,
  PlatformAuth,
  ManualFlag,
  ManualFlagReason,
  PlatformAuthStore,
  ContentStore,
  ContentRow,
  SocialDispatchDeps,
  SocialDispatchEvent,
  OwnedProfilePost,
  OwnedProfileSnapshot,
  YouTubeAnalytics28d,
  PendingComment,
  EngagementDelta,
  OwnedSocialPlatform,
  OwnedSocialAccountInput,
  OwnedSocialRecentPostsInput,
  OwnedSocialPostDetailsInput,
  OwnedSocialAccountSummary,
  OwnedSocialAnalytics,
  OwnedSocialComment,
  OwnedSocialPostDetails,
  OwnedSocialProfileProvider,
} from "./schema";

export { PUBLISH_PLATFORMS } from "./schema";
