import {
  processCommentEvent,
  processDirectMessageEvent,
  type CommentEventDeps,
} from "../automation/engine";

export function createInstagramAutomationService(deps: CommentEventDeps) {
  return {
    processCommentEvent: (event: Parameters<typeof processCommentEvent>[0]) =>
      processCommentEvent(event, deps),
    processDirectMessageEvent: (event: Parameters<typeof processDirectMessageEvent>[0]) =>
      processDirectMessageEvent(event, deps),
  };
}
