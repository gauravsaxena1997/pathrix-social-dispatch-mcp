export const API_ENDPOINTS = {
  meta: "https://graph.facebook.com/v22.0",
  threads: "https://graph.threads.net/v1.0",
  reddit_oauth: "https://oauth.reddit.com",
  yt_api: "https://www.googleapis.com/youtube/v3",
  yt_upload: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable",
  x_api: "https://api.x.com/2",
} as const;

export const POLL_CONFIG = {
  ig_container_timeout_ms: 120_000,
  ig_container_poll_interval_ms: 5_000,
  threads_settle_ms: 2_000,
  yt_processing_timeout_ms: 10 * 60 * 1000,
  yt_processing_poll_interval_ms: 60_000,
} as const;

export const PLATFORM_LIMITS = {
  instagram: {
    maxCarouselImages: 10,
    maxCaptionLength: 2200,
  },
  threads: {
    maxPostLength: 500,
  },
  facebook_page: {
    maxPostLength: 63206,
  },
  reddit: {
    selfPromoRatioMax: 0.1,
    rateLimit: 60,
  },
  youtube: {
    quotaPerUpload: 1600,
    quotaPerDay: 10000,
    pollIntervalMs: 60_000,
  },
  x: {
    monthlyWriteLimit: 1500,
    writeWarningThreshold: 0.8,
    tweetMaxLength: 280,
    duplicateWindowHours: 24,
  },
} as const;

export const DISPATCH_CONFIG = {
  maxConcurrentJobs: 3,
  retryDelayMs: 30_000,
  maxRetries: 1,
  stalledPublishingThresholdMs: 10 * 60 * 1000,
  circuitBreakerFailureCount: 3,
  circuitBreakerCooldownMs: 15 * 60 * 1000,
} as const;
