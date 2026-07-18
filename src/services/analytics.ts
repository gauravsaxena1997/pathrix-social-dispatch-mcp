import type { OwnedSocialAnalytics, OwnedSocialPlatform, OwnedSocialAccountInput } from "../schema";
import { createInstagramService } from "./instagram";
import { createYouTubeService } from "./youtube";
import type { InstagramServiceDeps, YouTubeServiceDeps } from "./types";

export interface SocialAnalyticsService {
  getAccountAnalytics(input: {
    platform: OwnedSocialPlatform;
    accountId: string;
    handle: string;
  }): Promise<OwnedSocialAnalytics | { platform: "youtube"; analytics: Awaited<ReturnType<ReturnType<typeof createYouTubeService>["getAnalytics"]>> }>;
}

export function createSocialAnalyticsService(deps: {
  instagram: InstagramServiceDeps;
  youtube: YouTubeServiceDeps;
}): SocialAnalyticsService {
  const instagram = createInstagramService(deps.instagram);
  const youtube = createYouTubeService(deps.youtube);

  return {
    async getAccountAnalytics({ platform, accountId, handle }) {
      if (platform === "instagram") {
        const input: OwnedSocialAccountInput = { accessToken: "", handle };
        const auth = await deps.instagram.authStore.load("instagram", accountId);
        if (!auth || typeof auth.tokens.access_token !== "string") throw new Error("instagram_auth_missing");
        input.accessToken = auth.tokens.access_token;
        return instagram.getAnalytics(input);
      }
      return { platform: "youtube", analytics: await youtube.getAnalytics({ accountId }) };
    },
  };
}
