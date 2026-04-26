export { registerSocialDispatchTools } from "./tools";

// Config constants
export { API_ENDPOINTS, POLL_CONFIG, PLATFORM_LIMITS, DISPATCH_CONFIG } from "./config";

// Token refresh (framework-agnostic, requires PlatformAuthStore)
export { getValidMetaToken, getValidYouTubeToken, getValidXToken, refreshAllTokens } from "./token-refresher";

// Auth handler functions (OAuth init + callback logic)
export { initMetaAuth, handleMetaCallback } from "./auth/handlers";
export { initYouTubeAuth, handleYouTubeCallback } from "./auth/handlers";
export { initXAuth, handleXCallback } from "./auth/handlers";

// Adapters
export { publishSelfPost, publishLinkPost, getUserRecentPosts, checkSelfPromoRatio } from "./adapters/reddit";
export { publishIgImage, publishIgReel, publishIgCarousel } from "./adapters/instagram";
export { publishThreadsPost } from "./adapters/threads";
export { publishFbPagePost, publishFbPagePhoto } from "./adapters/facebook-page";
export { uploadYouTubeVideo, pollYouTubeProcessing } from "./adapters/youtube";
export { publishXTweet, publishXThread, splitIntoThread } from "./adapters/x";

// Auth helpers (low-level OAuth URL generation + code exchange)
export { getMetaAuthorizeUrl, exchangeMetaCode, getLongLivedToken, refreshLongLivedToken, getIgUserId, getPageId, getThreadsUserId } from "./auth/meta";
export { getYouTubeAuthorizeUrl, exchangeYouTubeCode, refreshYouTubeToken } from "./auth/youtube";
export { generatePkce, getXAuthorizeUrl, exchangeXCode, refreshXToken } from "./auth/x";

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
} from "./schema";

export { PUBLISH_PLATFORMS } from "./schema";
