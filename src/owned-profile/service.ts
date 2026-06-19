import type {
  OwnedProfilePost,
  OwnedProfileSnapshot,
  OwnedSocialAccountInput,
  OwnedSocialAccountSummary,
  OwnedSocialAnalytics,
  OwnedSocialPlatform,
  OwnedSocialPostDetails,
  OwnedSocialPostDetailsInput,
  OwnedSocialProfileProvider,
  OwnedSocialRecentPostsInput,
} from "../schema";
import { instagramOwnedProfileProvider } from "./instagram";
import { youtubeOwnedProfileProvider } from "./youtube";

const providers: Partial<Record<OwnedSocialPlatform, OwnedSocialProfileProvider>> = {
  instagram: instagramOwnedProfileProvider,
  youtube: youtubeOwnedProfileProvider,
};

function getProvider(platform: OwnedSocialPlatform): OwnedSocialProfileProvider {
  const provider = providers[platform];
  if (!provider) {
    throw new Error(`owned_social_provider_not_implemented:${platform}`);
  }
  return provider;
}

export async function refreshAccountSnapshot(
  platform: OwnedSocialPlatform,
  input: OwnedSocialAccountInput,
): Promise<OwnedProfileSnapshot> {
  return getProvider(platform).refreshAccountSnapshot(input);
}

export async function getAccountSummary(
  platform: OwnedSocialPlatform,
  input: OwnedSocialAccountInput,
): Promise<OwnedSocialAccountSummary> {
  return getProvider(platform).getAccountSummary(input);
}

export async function getRecentPosts(
  platform: OwnedSocialPlatform,
  input: OwnedSocialRecentPostsInput,
): Promise<OwnedProfilePost[]> {
  return getProvider(platform).getRecentPosts(input);
}

export async function getAccountAnalytics(
  platform: OwnedSocialPlatform,
  input: OwnedSocialAccountInput,
): Promise<OwnedSocialAnalytics> {
  return getProvider(platform).getAccountAnalytics(input);
}

export async function getPostDetails(
  platform: OwnedSocialPlatform,
  input: OwnedSocialPostDetailsInput,
): Promise<OwnedSocialPostDetails> {
  return getProvider(platform).getPostDetails(input);
}
