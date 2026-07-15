export const CommentAutomationAction = {
  DM_SENT: "DM_SENT",
  PUBLIC_REPLY: "PUBLIC_REPLY",
  FOLLOW_GATE_REPLY: "FOLLOW_GATE_REPLY",
  FOLLOW_GATE_SENT: "FOLLOW_GATE_SENT",
  FOLLOW_GATE_RETRY_SENT: "FOLLOW_GATE_RETRY_SENT",
  NONE: "NONE",
} as const;

export type CommentAutomationAction =
  typeof CommentAutomationAction[keyof typeof CommentAutomationAction];

export const CommentAutomationEventStatus = {
  RECEIVED: "RECEIVED",
  PROCESSED: "PROCESSED",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
  DUPLICATE: "DUPLICATE",
} as const;

export type CommentAutomationEventStatus =
  typeof CommentAutomationEventStatus[keyof typeof CommentAutomationEventStatus];

export const FollowGateFlowStatus = {
  PENDING: "PENDING",
  DELIVERY_IN_PROGRESS: "DELIVERY_IN_PROGRESS",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
} as const;

export type FollowGateFlowStatus =
  typeof FollowGateFlowStatus[keyof typeof FollowGateFlowStatus];

export const DEFAULT_FOLLOW_GATE_INITIAL_TEMPLATE =
  "Hey, thanks for checking out the reel. I've got the resource ready for you.\n\nIf you already follow me, tap \"I follow\" below and I'll send it straight over. If you don't, follow the account first, then come back and tap the button.";

export const DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE =
  "Almost there. I couldn't confirm the follow just yet.\n\nIf you've already followed, give Instagram a few seconds and tap \"I follow\" again. If not, follow the account first, then come back and tap the button. I'll send the resource as soon as it comes through.";

export const FOLLOW_GATE_RECHECK_PREFIX = "FOLLOW_GATE_RECHECK:";

export const FOLLOWER_STATUS_FRESHNESS_WINDOW_MS = 2 * 60 * 1000;
