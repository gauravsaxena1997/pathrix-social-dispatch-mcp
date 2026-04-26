# @pathrix/social-dispatch

Publishing arm for [Pathrix](https://github.com/gauravsaxena1997/pathrix-social-dispatch-mcp). Draft content with your AI partner, schedule it, and it auto-posts to Instagram, Threads, Facebook Page, Reddit, YouTube, and X - with per-platform status tracking and Discord alerts.

---

## Why Social Dispatch

Most content systems stop at drafts. You still have to open six apps, copy-paste captions, handle platform quirks, and remember to post. Social Dispatch closes that loop: one MCP call schedules a post, a background cron fires it at the right time, and you get a Discord ping when it lands.

When a platform requires a manual step (Instagram Reel with trending audio, for example), it flags the post, pings you with the content, and gives you a 30-second in-app job instead of a 30-minute context switch.

---

## Works with any MCP client

Claude Code, Claude Desktop, Cursor, Windsurf, or any client that speaks MCP.

```json
{
  "mcpServers": {
    "pathrix": {
      "command": "node",
      "args": ["/path/to/pathrix/.next/standalone/server.js"],
      "env": {
        "MCP_MODE": "true"
      }
    }
  }
}
```

> v0.1.0 note: Social Dispatch is bundled with Pathrix. It reads content rows from the Pathrix SQLite DB. Standalone mode (works without Pathrix) is planned for v0.2.0.

---

## Quick start

1. Clone Pathrix and install dependencies:
   ```bash
   git clone https://github.com/gauravsaxena1997/pathrix-social-dispatch-mcp
   cd pathrix
   pnpm install
   ```

2. Add platform credentials to `.env` (see Environment Variables below)

3. Start Pathrix:
   ```bash
   pnpm dev
   ```

4. Open `http://localhost:8888/documentation/social-dispatch` and click Connect for each platform

5. Ask your AI partner:
   > "Schedule this content for 5pm tomorrow on Instagram and X"

---

## What you can ask

```
social_list_platform_auth()
- Which platforms are connected right now?

social_publish_now(contentId="abc123")
- Post this immediately to all target platforms

social_schedule(contentId="abc123", scheduledAt="2026-05-01T17:00:00Z", platformTargets=["instagram","x"])
- Schedule for a specific time

social_get_publish_status(contentId="abc123")
- What happened? Show me the post URLs and any errors

social_cancel_schedule(contentId="abc123")
- Nevermind, reset to draft

social_mark_published(contentId="abc123", platform="instagram", postUrl="https://...")
- I finished the manual step in IG. Mark it done.
```

---

## Platform matrix

| Platform | Auth | Post types | Known limits |
|---|---|---|---|
| Instagram | Meta OAuth | Reel, Carousel, Single image, Story | Carousel max 10. Trending audio = manual step. |
| Threads | Meta OAuth (shared) | Text + optional media | 500 char limit |
| Facebook Page | Meta OAuth (shared) | Post, Photo | Page must exist on connected account |
| Reddit | Reddit OAuth | Self post (text) | Self-promo >10% blocks post. Per-sub karma gates. |
| YouTube | Google OAuth | Short + long-form video | 1,600 units/upload. 10k/day quota. Async processing. |
| X / Twitter | X OAuth2 PKCE | Tweet, Thread | 280 chars/tweet. 1,500 writes/month free tier. |

---

## How it works

### Auth flow

```
User clicks Connect (Pathrix UI)
    |
    v
OAuth initiation route (/api/social-dispatch/auth/<platform>)
    |  generates state + PKCE (X), stores in httpOnly cookie
    v
Platform login page (Meta, Google, X, Reddit)
    |  user grants permissions
    v
Callback route (/api/social-dispatch/auth/<platform>/callback)
    |  exchanges code for tokens
    v
Records table (type="platform_auth", title="social-dispatch:<platform>:default")
    |  tokens stored as JSON: { access_token, refresh_token, expires_at }
    v
Platform Connection Status on doc page shows green
```

### Dispatch flow

```
social_schedule() or UI Schedule button
    |  sets publishStatus = "scheduled", scheduledAt, platformTargets
    v
PUBLISH_DUE_CONTENT cron (every 1 min)
    |  finds rows WHERE publishStatus='scheduled' AND scheduledAt <= NOW()
    |  sets status = "publishing" (atomic)
    v
publisher.ts
    |  resolves platformTargets, calls adapter per platform in parallel
    v
Platform adapter (e.g., instagram.ts)
    |  calls native API (Meta Graph, X v2, YouTube Data, Reddit OAuth)
    v
Result saved
    |  publishStatus = "published" | "failed" | "manual_required"
    |  platformPostIds = { instagram: "https://...", x: "https://..." }
    v
Discord alert fires
```

### Manual-required flow

```
IG adapter detects trending audio restriction
    |
    v
publishStatus = "manual_required"
manualFlags = ["instagram:trending_audio"]
Discord alert pings you with caption + instructions
    |
    v
You open IG Reels in-app (~30s) - pick audio, publish
    |
    v
Paste live URL into Pathrix drawer OR call social_mark_published()
    |
    v
publishStatus = "published", platformPostIds updated
```

---

## Available tools

| Tool | Description |
|---|---|
| `social_schedule` | Schedule content for a specific UTC time, optional platform override |
| `social_publish_now` | Bypass schedule, publish immediately |
| `social_get_publish_status` | Get per-platform URLs, status, error, publishedAt |
| `social_cancel_schedule` | Reset scheduled row back to draft |
| `social_list_platform_auth` | List connected platforms with last-updated timestamp |
| `social_mark_published` | Close manual_required loop after finishing in-app |

---

## Full setup per platform

### Meta (Instagram + Threads + Facebook Page)

1. Go to [developers.facebook.com](https://developers.facebook.com) - create an app
2. Add products: Instagram Graph API, Facebook Login
3. Set redirect URI: `$NEXT_PUBLIC_BASE_URL/api/social-dispatch/auth/meta/callback`
4. Add `META_APP_ID` and `META_APP_SECRET` to `.env`
5. Click Connect on the doc page - one flow grants all three platforms

> Local dev: Meta requires HTTPS for redirects. Use ngrok or Cloudflare Tunnel: `ngrok http 8888`

### YouTube

1. Go to [console.cloud.google.com](https://console.cloud.google.com) - create a project
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials - type: Web application
4. Set redirect URI: `$NEXT_PUBLIC_BASE_URL/api/social-dispatch/auth/youtube/callback`
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`

### X / Twitter

1. Go to [developer.x.com](https://developer.x.com) - create an app (free tier)
2. Enable OAuth 2.0, set callback URL: `$NEXT_PUBLIC_BASE_URL/api/social-dispatch/auth/x/callback`
3. Scopes: `tweet.read tweet.write users.read offline.access`
4. Add `X_CLIENT_ID` and `X_CLIENT_SECRET` to `.env`

### Reddit

Shared with the Scout integration. If Reddit is already connected (orange dot shows green in the profile platform section), Social Dispatch can post immediately.

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) - create an app (script type for personal use)
2. Redirect URI: `$NEXT_PUBLIC_BASE_URL/api/auth/reddit/callback`
3. Add `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` to `.env`

---

## Environment variables

```bash
# Meta (Instagram + Threads + Facebook Page)
META_APP_ID=
META_APP_SECRET=

# YouTube
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# X / Twitter
X_CLIENT_ID=
X_CLIENT_SECRET=

# Reddit (shared with Scout)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=

# Required for correct OAuth redirect URIs
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# Discord webhook for publish alerts (optional but recommended)
DISCORD_WEBHOOK_CONTENT=
```

Copy `.env.example` to `.env` and fill in the values.

---

## Data storage

**Auth tokens** are stored in the Pathrix `Record` table:
```
type = "platform_auth"
title = "social-dispatch:<platform>:default"
configJson = { platform, accountId }
dataJson = { access_token, refresh_token, expires_at }
```

No new tables. Follows the same pattern as the Scout Reddit integration.

**Content publish state** is tracked on the `Content` table:
```
publishStatus     - draft | scheduled | publishing | published | failed | manual_required
platformPostIds   - JSON { instagram: "url", x: "url", ... }
publishError      - last error message
manualFlags       - JSON ["instagram:trending_audio", ...]
platformTargets   - JSON ["instagram", "x", ...]
```

---

## Rate limits and quotas

| Platform | Limit | Handling |
|---|---|---|
| X / Twitter | 1,500 writes/month (free) | v0.1.1: counter in Records, warn at 80% |
| YouTube | 10,000 units/day, 1,600/upload | v0.1.1: quota tracking in Records |
| Reddit | 60 req/min | Not an issue at solo volume |
| Meta / Instagram | No hard quota for personal posting | Container policy violations caught as errors |

---

## Cron jobs (required for scheduled publishing)

Three cron jobs must be registered in Pathrix for publishing to work automatically:

| Job | Schedule | Purpose |
|---|---|---|
| `PUBLISH_DUE_CONTENT` | Every 1 min | Picks up scheduled content, dispatches up to 3 in parallel |
| `REFRESH_PLATFORM_TOKENS` | Daily 3am | Proactively refreshes Meta, YouTube, X tokens before they expire |
| `WATCHDOG_STALLED_PUBLISHING` | Every 15 min | Resets rows stuck in "publishing" >10 min back to scheduled |

Add them via the Pathrix Automations page (`/automations`) or via the crons seed script.

---

## Running Without Pathrix

> This section is for developers building their own system on top of the adapter layer. Pathrix users can skip this.

The adapters (`src/adapters/`) and auth helpers (`src/auth/`) have zero Pathrix dependencies - you can import them directly. The only Pathrix-specific layer is `src/lib/social-dispatch/` which reads from Pathrix's SQLite `Content` table.

To run Social Dispatch standalone you need to implement three things:

### 1. ContentStore

Implement the `ContentStore` interface from `src/schema.ts`:

```typescript
import type { ContentStore, ContentRow, PublishStatus } from "@pathrix/social-dispatch";

const myStore: ContentStore = {
  async get(id: string): Promise<ContentRow | null> {
    // load a content row from your DB
  },
  async schedule(id: string, scheduledAt: Date): Promise<void> {
    // set publishStatus = "scheduled" in your DB
  },
  async cancelSchedule(id: string): Promise<{ ok: boolean; reason?: string }> {
    // set publishStatus = "draft" if not already publishing
  },
  async resolveManualFlag(id: string, platform: string, postUrl: string): Promise<{ finalStatus: PublishStatus }> {
    // mark one platform as done, return final status
  },
};
```

### 2. PlatformAuthStore

Implement the `PlatformAuthStore` interface:

```typescript
import type { PlatformAuthStore } from "@pathrix/social-dispatch";

const myAuthStore: PlatformAuthStore = {
  async load(platform: string, accountId: string) {
    // return { tokens: { access_token, expires_at, ... } } or null
  },
  async save({ platform, accountId, tokens }) {
    // persist tokens in your storage layer
  },
};
```

### 3. Three cron handlers

Run these on a schedule (any cron system - Vercel Cron, BullMQ, node-cron, etc.):

```typescript
import { getValidMetaToken, getValidYouTubeToken, getValidXToken } from "@pathrix/social-dispatch";

// PUBLISH_DUE_CONTENT - run every 1 minute
async function publishDueContent(store: ContentStore, authStore: PlatformAuthStore) {
  const due = await store.findScheduledBefore(new Date()); // your query
  for (const row of due.slice(0, 3)) {
    await store.setPublishStatus(row.id, "publishing");
    try {
      // dispatch based on row.platform - see src/lib/social-dispatch/publisher.ts for reference
      await store.setPublishStatus(row.id, "published");
    } catch (err) {
      await store.setPublishStatus(row.id, "failed", String(err));
    }
  }
}

// REFRESH_PLATFORM_TOKENS - run daily at 3am
async function refreshAllTokens(authStore: PlatformAuthStore) {
  await getValidMetaToken("default", authStore);
  await getValidYouTubeToken("default", authStore);
  await getValidXToken("default", authStore);
}

// WATCHDOG_STALLED_PUBLISHING - run every 15 minutes
async function watchdogStalledPublishing(store: ContentStore) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  // reset rows stuck in "publishing" for >10 min back to "scheduled"
  await store.resetStalledPublishing(cutoff);
}
```

The files in `packages/social-dispatch/src/dispatch/` (`publisher.ts`, `scheduler.ts`, `retry.ts`, `manual-flag.ts`) are stubs reserved for a future standalone cron runner. They are intentionally empty in v0.1.0.

### Known limitations in v0.1.0

- YouTube quota tracking (`getYouTubeDailyQuotaUsed`) always returns 0. Implement your own counter in your storage layer using the Records table pattern or any key-value store. Reset daily at midnight UTC.
- X monthly write counter is not tracked. At solo posting volumes (1-2 posts/day) the free tier limit (1,500 writes/month) is not a concern.

---

## Contributing

The adapter pattern is additive. To add a new platform:

1. Create `src/adapters/<platform>.ts` with publish functions
2. Create `src/auth/<platform>.ts` with OAuth helpers
3. Add the platform to `src/config.ts` and `src/index.ts`
4. Register adapter in `src/dispatch/publisher.ts`
5. Add OAuth routes in `src/app/api/social-dispatch/auth/<platform>/`
6. Add to the platform matrix in the doc page

LinkedIn, TikTok, Pinterest, Bluesky - all follow the same pattern.

---

## License

MIT - see [LICENSE](LICENSE)
