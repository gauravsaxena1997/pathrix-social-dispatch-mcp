export interface CommentAutomationRule {
  id: string;
  /** "any" matches all posts; otherwise must equal the mediaId */
  postId: string;
  keywords: string[];
  replyPool: string[];
  dmTemplate: string;
  followGate: boolean;
  followGateReply: string;
  active: boolean;
}

/** Implemented by the host application (CarrierOS) using Prisma */
export interface AutomationRuleStore {
  getActiveRulesForPost(mediaId: string): Promise<CommentAutomationRule[]>;
}
