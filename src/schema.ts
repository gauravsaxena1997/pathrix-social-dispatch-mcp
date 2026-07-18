export type PublishPlatform =
  | "instagram"
  | "threads"
  | "facebook_page"
  | "reddit"
  | "youtube"
  | "x";

export const PUBLISH_PLATFORMS: PublishPlatform[] = [
  "instagram",
  "threads",
  "facebook_page",
  "reddit",
  "youtube",
  "x",
] as const;

export type PublishStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "manual_required";

export type ManualFlagReason =
  | "trending_audio"
  | "thumbnail_design"
  | "caption_edit"
  | "platform_policy";

export interface PlatformAuth {
  platform: PublishPlatform;
  accountId: string;
  tokens: Record<string, string | number>;
  expiresAt?: number;
}

export interface PublishJob {
  contentId: string;
  platforms: PublishPlatform[];
  caption?: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
}

export interface PublishResult {
  platform: PublishPlatform;
  status: PublishStatus;
  postId?: string;
  postUrl?: string;
  error?: string;
  manualFlags?: ManualFlagReason[];
}

export interface ManualFlag {
  platform: PublishPlatform;
  reasons: ManualFlagReason[];
  contentId: string;
  caption?: string;
  mediaUrls?: string[];
}

// ─── Storage interfaces (implemented by the host application) ────────────────

export interface PlatformAuthStore {
  load(platform: PublishPlatform, accountId: string): Promise<PlatformAuth | null>;
  save(auth: PlatformAuth): Promise<void>;
  list(): Promise<Array<{ platform: string; accountId: string; updatedAt: Date }>>;
}

export type ContentRow = {
  id: string;
  title: string;
  caption: string | null;
  platform: string;
  mediaJson: string;
  platformPostIds: string | null;
  publishStatus: string | null;
  publishError: string | null;
  manualFlags: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
};

export interface ContentStore {
  get(id: string): Promise<ContentRow | null>;
  schedule(id: string, scheduledAt: Date): Promise<void>;
  cancelSchedule(id: string): Promise<{ ok: boolean; reason?: string }>;
  resolveManualFlag(id: string, platform: string, postUrl: string): Promise<{ finalStatus: PublishStatus }>;
}

export interface SocialStore {
  getAuth(platform: PublishPlatform, accountId: string): Promise<PlatformAuth | null>;
  saveAuth(auth: PlatformAuth): Promise<void>;
  getAutomationBinding(id: string): Promise<AutomationBinding | null>;
  saveAutomationBinding(binding: AutomationBinding): Promise<void>;
  appendAutomationEvent(event: AutomationEvent): Promise<void>;
  recordIdempotency(key: string, result: unknown): Promise<void>;
}

export interface AutomationBinding {
  id: string;
  accountId: string;
  expectedPublishAt: Date;
  captionText: string;
  mediaType?: string | null;
  status: "pending" | "matched" | "ambiguous" | "expired" | "failed" | "cancelled";
  matchedMediaId?: string | null;
}

export interface AutomationEvent {
  eventKey: string;
  eventType: "comment" | "message" | "story_reply";
  status: "received" | "processing" | "completed" | "failed" | "dead_letter";
  payload: Record<string, unknown>;
  createdAt: Date;
}

// ─── Owned-account profile snapshots ─────────────────────────────────────────

export interface OwnedProfilePost {
  id: string;
  url: string;
  content: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares?: number;
  reposts?: number;
  views?: number;
  isViral: boolean;
  imageUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaType?: string;
  mediaProductType?: string;
  duration?: number;
}

export interface PendingComment {
  commentId: string;
  postId: string;
  postTitle: string;
  postUrl: string;
  commentBody: string;
  author: string;
  publishedAt: string;
  likes: number;
  isUrgent: boolean;
}

export interface EngagementDelta {
  followersDelta: number;
  viewsDelta?: number;
  likesDelta?: number;
  measuredAt: string;
  windowHours: number;
}

export interface OwnedProfileSnapshot {
  platform: string;
  handle: string;
  fetchedAt: string;
  followers: number;
  posts: OwnedProfilePost[];
  stats: Record<string, number | string>;
  avatarUrl?: string;
  bannerUrl?: string;
  displayName?: string;
  pendingComments?: PendingComment[];
  engagementDelta?: EngagementDelta;
}

export type OwnedSocialPlatform = "instagram" | "youtube";

export interface OwnedSocialAccountInput {
  accessToken: string;
  handle: string;
}

export interface OwnedSocialRecentPostsInput extends OwnedSocialAccountInput {
  limit?: number;
}

export interface OwnedSocialPostDetailsInput extends OwnedSocialAccountInput {
  postId: string;
}

export interface OwnedSocialAccountSummary {
  platform: OwnedSocialPlatform;
  handle: string;
  fetchedAt: string;
  followers: number;
  following?: number;
  totalPosts?: number;
  displayName?: string;
  avatarUrl?: string;
  biography?: string;
  website?: string;
}

export interface OwnedSocialAudienceActivity {
  hourly: Record<string, number>;
  source: string;
  metric: string;
  period: string;
  bestHourlyEngagementWindow: {
    hour: number;
    label: string;
    value: number;
  } | null;
}

export interface OwnedSocialEngagementWindow {
  priority: 1 | 2 | 3;
  startHour: number;
  endHour: number;
  label: string;
  score: number;
  hourlyBreakdown: Array<{
    hour: number;
    label: string;
    value: number;
  }>;
  recommendedPublishHour: number;
  recommendedPublishLabel: string;
}

export interface OwnedSocialAnalytics {
  platform: OwnedSocialPlatform;
  handle: string;
  fetchedAt: string;
  metrics: Record<string, number | string>;
  audienceGenderAge?: Record<string, number>;
  audienceCountry?: Record<string, number>;
  audienceCity?: Record<string, number>;
  audienceActivity?: OwnedSocialAudienceActivity;
}

export interface OwnedSocialComment {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  likeCount: number;
}

export interface OwnedSocialPostDetails {
  platform: OwnedSocialPlatform;
  postId: string;
  fetchedAt: string;
  metrics: Record<string, number>;
  comments: OwnedSocialComment[];
}

export interface OwnedSocialProfileProvider {
  getAccountSummary(input: OwnedSocialAccountInput): Promise<OwnedSocialAccountSummary>;
  getRecentPosts(input: OwnedSocialRecentPostsInput): Promise<OwnedProfilePost[]>;
  getAccountAnalytics(input: OwnedSocialAccountInput): Promise<OwnedSocialAnalytics>;
  getPostDetails(input: OwnedSocialPostDetailsInput): Promise<OwnedSocialPostDetails>;
  refreshAccountSnapshot(input: OwnedSocialAccountInput): Promise<OwnedProfileSnapshot>;
}

export interface YouTubeAnalytics28d {
  watchTimeMinutes: number;
  views: number;
  likes: number;
  avgViewDurationSec: number;
  subscribersGained: number;
  subscribersLost: number;
}

// ─── Event hook (optional - wire to Discord, Slack, email, or any channel) ────

export type SocialDispatchEvent = {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

// ─── Dependency bundle passed to registerSocialDispatchTools ─────────────────

export interface SocialDispatchDeps {
  contentStore: ContentStore;
  authStore: PlatformAuthStore;
  publisher: (contentId: string) => Promise<PublishResult[]>;
  onEvent?: (e: SocialDispatchEvent) => void | Promise<void>;
}
