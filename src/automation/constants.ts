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
  "Hey! I’ve got the resource ready for you 😊 Follow me here, then tap “I follow” and I’ll send it over.";

export const DEFAULT_FOLLOW_GATE_RETRY_TEMPLATE =
  "Hey, I still can’t see the follow on my side. Follow me here when you get a chance, then tap “I follow” again and I’ll check one more time 😊";

export const FOLLOW_GATE_RECHECK_PREFIX = "FOLLOW_GATE_RECHECK:";
