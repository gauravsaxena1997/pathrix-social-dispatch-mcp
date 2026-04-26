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

// ─── Dependency bundle passed to registerSocialDispatchTools ─────────────────

export interface SocialDispatchDeps {
  contentStore: ContentStore;
  authStore: PlatformAuthStore;
  publisher: (contentId: string) => Promise<PublishResult[]>;
}
