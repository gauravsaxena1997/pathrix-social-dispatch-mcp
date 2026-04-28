import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocialDispatchDeps } from "./schema";

const DepsSchema = z.object({
  contentStore: z.object({ get: z.function(), schedule: z.function(), cancelSchedule: z.function(), resolveManualFlag: z.function() }),
  authStore: z.object({ load: z.function(), save: z.function(), list: z.function() }),
  publisher: z.function(),
  onEvent: z.function().optional(),
});

export function registerSocialDispatchTools(
  server: McpServer,
  deps: SocialDispatchDeps
): void {
  DepsSchema.parse(deps);
  const { contentStore, authStore, publisher, onEvent } = deps;
  const emit = (type: string, payload: Record<string, unknown>) =>
    onEvent?.({ type, payload, timestamp: new Date().toISOString() });

  server.tool(
    "social_list_platform_auth",
    "List which social platforms are currently connected (have valid auth tokens stored). Returns platform name, account ID, and last updated timestamp.",
    {},
    async () => {
      try {
        const platforms = await authStore.list();
        if (platforms.length === 0) {
          return { content: [{ type: "text", text: "No platforms connected yet. Connect each platform via your application's auth flow." }] };
        }
        const lines = platforms.map((p) => `- ${p.platform} (${p.accountId}) - last updated ${p.updatedAt.toISOString()}`);
        return { content: [{ type: "text", text: `Connected platforms:\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    "social_publish_now",
    `Publish a content row immediately to its platform.
The content's platform field determines where it posts.
For Reddit: caption must start with "r/subredditname" on the first line.
Returns per-platform publish results (status, postUrl, error).`,
    { contentId: z.string().describe("ID of the content row to publish") },
    async ({ contentId }) => {
      try {
        const results = await publisher(contentId);
        await emit("dispatch.publish_complete", { contentId, results });
        const lines = results.map((r) => {
          if (r.status === "published") return `- ${r.platform}: published - ${r.postUrl}`;
          if (r.status === "manual_required") return `- ${r.platform}: manual_required - finish in app, then call social_mark_published`;
          return `- ${r.platform}: failed - ${r.error}`;
        });
        return { content: [{ type: "text", text: `Publish results for ${contentId}:\n${lines.join("\n")}` }] };
      } catch (err) {
        await emit("dispatch.publish_error", { contentId, error: err instanceof Error ? err.message : String(err) });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    "social_get_publish_status",
    "Get the current publish status of a content row. Returns publishStatus, per-platform post URLs, any error message, and the publishedAt timestamp.",
    { contentId: z.string().describe("ID of the content row") },
    async ({ contentId }) => {
      try {
        const row = await contentStore.get(contentId);
        if (!row) return { content: [{ type: "text", text: `Error: content not found: ${contentId}` }], isError: true };

        const postIds: Record<string, string> = (() => { try { return JSON.parse(row.platformPostIds ?? "{}"); } catch { return {}; } })();
        const flags: string[] = (() => { try { return JSON.parse(row.manualFlags ?? "[]"); } catch { return []; } })();
        const postIdLines = Object.entries(postIds).map(([p, url]) => `  ${p}: ${url}`).join("\n");

        const lines = [
          `Title: ${row.title}`,
          `Status: ${row.publishStatus ?? "draft"}`,
          postIdLines ? `Posts:\n${postIdLines}` : null,
          row.publishError ? `Error: ${row.publishError}` : null,
          flags.length ? `Manual flags: ${flags.join(", ")}` : null,
          row.publishedAt ? `Published at: ${row.publishedAt.toISOString()}` : null,
        ].filter(Boolean);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    "social_schedule",
    `Schedule a content row to be published at a specific time.
Sets publishStatus to 'scheduled' and scheduledAt to the given timestamp.
A PUBLISH_DUE_CONTENT cron job (or equivalent scheduler) picks it up when the time arrives.`,
    {
      contentId: z.string().describe("ID of the content row"),
      scheduledAt: z.string().describe("ISO 8601 datetime string for when to publish (UTC)"),
    },
    async ({ contentId, scheduledAt }) => {
      try {
        const date = new Date(scheduledAt);
        if (isNaN(date.getTime())) {
          return { content: [{ type: "text", text: `Error: invalid scheduledAt: ${scheduledAt}` }], isError: true };
        }
        await contentStore.schedule(contentId, date);
        return { content: [{ type: "text", text: `Scheduled content ${contentId} for ${date.toISOString()}. PUBLISH_DUE_CONTENT cron will dispatch it automatically.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    "social_cancel_schedule",
    "Cancel a scheduled publish for a content row. Resets publishStatus from 'scheduled' back to 'draft'. Has no effect if the content is already publishing or published.",
    { contentId: z.string().describe("ID of the content row") },
    async ({ contentId }) => {
      try {
        const result = await contentStore.cancelSchedule(contentId);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Cannot cancel: ${result.reason}` }], isError: true };
        }
        return { content: [{ type: "text", text: `Cancelled schedule for content ${contentId}. Status reset to draft.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    "social_mark_published",
    `Close the manual_required loop for a specific platform.
Use this after manually completing a post in-app (e.g., Instagram Reel where trending audio blocked auto-publish).
Saves the post URL and removes the platform from manualFlags. If no flags remain, flips publishStatus to 'published'.`,
    {
      contentId: z.string().describe("ID of the content row"),
      platform: z.string().describe("Platform that was manually published, e.g. 'instagram'"),
      postUrl: z.string().optional().describe("URL of the live post (recommended)"),
    },
    async ({ contentId, platform, postUrl }) => {
      try {
        const { finalStatus } = await contentStore.resolveManualFlag(contentId, platform, postUrl ?? "manual");
        const msg = finalStatus === "published"
          ? `${platform} marked published. All platforms done - status is now published.`
          : `${platform} marked published. Still has manual flags - status remains manual_required.`;
        return { content: [{ type: "text", text: msg }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}
