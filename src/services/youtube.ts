import { fetchYouTubeAnalytics, scrapeYouTubeProfileViaApi } from "../owned-profile/youtube";
import { getValidYouTubeToken } from "../token-refresher";
import { uploadYouTubeVideo, pollYouTubeProcessing } from "../adapters/youtube";
import type { PlatformAuthStore } from "../schema";
import type { YouTubeServiceDeps } from "./types";

export interface YouTubeService {
  upload(input: {
    accountId: string;
    title: string;
    description: string;
    videoUrl: string;
    tags?: string[];
    scheduledAt?: Date;
  }): Promise<{ videoId: string; url: string; processingStatus: string }>;
  pollProcessing(input: { accountId: string; videoId: string; timeoutMs?: number }): Promise<"processed" | "failed">;
  getAnalytics(input: { accountId: string }): Promise<NonNullable<Awaited<ReturnType<typeof fetchYouTubeAnalytics>>>>;
  getProfile(input: { accountId: string; handle: string }): Promise<NonNullable<Awaited<ReturnType<typeof scrapeYouTubeProfileViaApi>>>>;
}

async function getYouTubeAccessToken(authStore: PlatformAuthStore, accountId: string): Promise<string> {
  const auth = await getValidYouTubeToken(accountId, authStore);
  if (!auth?.accessToken) throw new Error("youtube_auth_missing");
  return auth.accessToken;
}

export function createYouTubeService(deps: YouTubeServiceDeps): YouTubeService {
  return {
    async upload({ accountId, title, description, videoUrl, tags, scheduledAt }) {
      const accessToken = await getYouTubeAccessToken(deps.authStore, accountId);
      return uploadYouTubeVideo(accessToken, title, description, videoUrl, tags ?? [], scheduledAt);
    },
    async pollProcessing({ accountId, videoId, timeoutMs }) {
      const accessToken = await getYouTubeAccessToken(deps.authStore, accountId);
      return pollYouTubeProcessing(videoId, accessToken, timeoutMs);
    },
    async getAnalytics({ accountId }) {
      const accessToken = await getYouTubeAccessToken(deps.authStore, accountId);
      const analytics = await fetchYouTubeAnalytics(accessToken);
      if (!analytics) throw new Error("youtube_analytics_unavailable");
      return analytics;
    },
    async getProfile({ accountId, handle }) {
      const accessToken = await getYouTubeAccessToken(deps.authStore, accountId);
      const profile = await scrapeYouTubeProfileViaApi(handle, accessToken);
      if (!profile) throw new Error("youtube_profile_not_found");
      return profile;
    },
  };
}
