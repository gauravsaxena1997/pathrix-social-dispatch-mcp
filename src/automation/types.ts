import type {
  CommentAutomationAction,
  CommentAutomationEventStatus,
  FollowGateFlowStatus,
} from "./constants";

export interface CommentAutomationRule {
  id: string;
  /** "any" matches all posts; otherwise must equal the mediaId */
  postId: string;
  triggerMode: "KEYWORDS" | "ANY_COMMENT" | "STORY_REPLY" | "ANY_STORY_REPLY";
  transportProvider?: "META" | "ZERNIO";
  keywords: string[];
  replyPool: string[];
  dmTemplate: string;
  followGate: boolean;
  followGateInitialTemplate: string;
  followGateRetryTemplate: string;
  active: boolean;
}

/** Implemented by the host application (CarrierOS) using Prisma */
export interface AutomationRuleStore {
  getActiveRulesForPost(mediaId: string): Promise<CommentAutomationRule[]>;
  getGlobalDefaultKeywords?(): Promise<string[]>;
  getGlobalReplyPool?(): Promise<string[]>;
  getGlobalFollowGateTemplates?(): Promise<{
    initialTemplate: string;
    retryTemplate: string;
  }>;
}

export interface InstagramAutomationTransport {
  readonly provider: "zernio";
  findConversation(input: { participantId: string }): Promise<{
    conversationId: string;
    isFollower?: boolean | null;
  } | null>;
  getFollowerStatus(input: {
    senderId: string;
    conversationId: string;
    freshAfter: Date;
  }): Promise<boolean | null>;
  sendPrivateReply(input: {
    postId: string;
    commentId: string;
    message: string;
    buttons?: Array<{ type: "postback"; title: string; payload: string }>;
  }): Promise<void>;
  sendConversationMessage(input: {
    conversationId: string;
    message: string;
  }): Promise<void>;
  sendConversationButton(input: {
    conversationId: string;
    message: string;
    title: string;
    payload: string;
  }): Promise<void>;
  replyToComment(input: {
    postId: string;
    commentId: string;
    message: string;
  }): Promise<void>;
}

export interface FollowGateFlow {
  token: string;
  senderId: string;
  commentId: string;
  mediaId: string;
  conversationId?: string;
  ruleId: string;
  resourceDmText: string;
  followGateRetryTemplate: string;
  status: FollowGateFlowStatus;
  retryCount: number;
  expiresAt: Date;
}

export interface FollowGateFlowStore {
  create(input: Omit<FollowGateFlow, "status" | "retryCount">): Promise<FollowGateFlow>;
  getByToken(token: string): Promise<FollowGateFlow | null>;
  claimResourceDelivery(token: string): Promise<boolean>;
  releaseResourceDelivery(token: string): Promise<void>;
  incrementRetry(token: string): Promise<void>;
  markCompleted(token: string): Promise<void>;
  expire?(token: string): Promise<void>;
}

export interface CommentAutomationEventInput {
  eventKey: string;
  eventType: "comment" | "message" | "story_reply";
  mediaId: string;
  commentId?: string;
  messageId?: string;
  commentText: string;
  fromUsername: string;
  senderResolvedUsername?: string;
  fromId?: string;
  threadId?: string;
  payloadJson: string;
}

export interface CommentAutomationEventOutcomeInput {
  eventKey: string;
  eventType?: "comment" | "message" | "story_reply";
  status: CommentAutomationEventStatus;
  action?: CommentAutomationAction;
  matchedRuleId?: string;
  failureReason?: string;
}

export interface CommentAutomationLedgerStore {
  claimIncomingComment(input: CommentAutomationEventInput): Promise<boolean>;
  claimIncomingMessage?(input: CommentAutomationEventInput): Promise<boolean>;
  markCommentOutcome(input: CommentAutomationEventOutcomeInput): Promise<void>;
  markMessageOutcome?(input: CommentAutomationEventOutcomeInput): Promise<void>;
}
