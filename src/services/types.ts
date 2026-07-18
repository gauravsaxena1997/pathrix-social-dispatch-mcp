import type { PlatformAuthStore, SocialStore } from "../schema";

export interface SocialServiceDeps {
  authStore: PlatformAuthStore;
  socialStore?: SocialStore;
}

export interface InstagramServiceDeps extends SocialServiceDeps {
  resolveInstagramUserId(input: {
    accessToken: string;
    preferredUserId?: string;
    username?: string;
  }): Promise<string>;
  resolveMetaPage(input: {
    accessToken: string;
    preferredPageId?: string;
    preferredUserId?: string;
    preferredUsername?: string;
  }): Promise<{ pageId: string; pageToken: string }>;
}

export type YouTubeServiceDeps = SocialServiceDeps;
