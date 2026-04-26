# Changelog

All notable changes to `@pathrix/social-dispatch` are documented here.

## [0.1.0] - 2026-04-24

### Added

- Initial release bundled with Pathrix
- Platform adapters: Instagram (Reel, Carousel, Single, Story), Threads, Facebook Page, Reddit (Self post, Link post), YouTube (Short + long-form), X / Twitter (Tweet, Thread)
- Meta OAuth flow - one authorization connects Instagram, Threads, and Facebook Page
- Google OAuth2 flow for YouTube with offline refresh token
- X OAuth2 PKCE flow
- Reddit OAuth reuse of existing Scout auth integration
- MCP tool registration via `registerSocialDispatchTools(mcpServer)`
- 6 Pathrix-facing MCP tools: `social_schedule`, `social_publish_now`, `social_get_publish_status`, `social_cancel_schedule`, `social_list_platform_auth`, `social_mark_published`
- Cron handlers: `PUBLISH_DUE_CONTENT` (1 min), `REFRESH_PLATFORM_TOKENS` (daily 3am), `WATCHDOG_STALLED_PUBLISHING` (15 min)
- `manual_required` flow for IG Reel trending audio - Discord alert + drawer UI to resolve
- Self-promo ratio guard for Reddit (blocks post if >10% promotional history)
- Instagram Carousel validation (max 10 images enforced at schedule time)
- YouTube async processing poll (upload returns `processing`, polls until `uploaded`)
- Per-platform retry with 30s backoff; second failure marks `failed`
- Token auto-refresh on mid-publish expiry
- Auth stored in Records table (`type="platform_auth"`) - no new DB tables
- Content schema extensions: `publishStatus`, `platformPostIds`, `publishError`, `manualFlags`, `platformTargets`
- UI: Publish panel in content drawer (platform checkboxes, Publish Now, Schedule, Cancel, manual-required resolve)
- Documentation page at `/documentation/social-dispatch` with live connection status, test cases, and env var checker

### Known limitations in v0.1.0

- Bundled with Pathrix - standalone MCP mode (without Pathrix DB) planned for v0.2.0
- Single account per platform (multi-account in v0.2.0)
- X free tier counter and YouTube daily quota tracking not yet enforced (planned v0.1.1)
- Post-publish silent removal detection not implemented (v0.2.0)
- LinkedIn not in scope (v0.2.0 if demand warrants)
- Tokens stored as plaintext JSON in Records - encryption at rest planned for v0.2.0
