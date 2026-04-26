const X_BASE = "https://api.x.com/2";
const TWEET_MAX = 280;

export interface XPublishResult {
  url: string;
  tweetId: string;
  threadIds?: string[];
}

async function postTweet(
  accessToken: string,
  text: string,
  replyToId?: string
): Promise<{ id: string; text: string }> {
  const body: Record<string, unknown> = { text: text.slice(0, TWEET_MAX) };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const res = await fetch(`${X_BASE}/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    data?: { id: string; text: string };
    errors?: Array<{ message: string }>;
    detail?: string;
  };
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.[0]?.message ?? json.detail ?? `http_${res.status}`;
    if (res.status === 403 && msg.toLowerCase().includes("duplicate")) {
      throw new Error("x_duplicate_post: identical tweet within 24h");
    }
    throw new Error(`x_tweet_${res.status}: ${msg}`);
  }
  return json.data!;
}

export async function publishXTweet(
  accessToken: string,
  text: string
): Promise<XPublishResult> {
  const tweet = await postTweet(accessToken, text);
  return { url: `https://x.com/i/web/status/${tweet.id}`, tweetId: tweet.id };
}

export async function publishXThread(
  accessToken: string,
  tweets: string[]
): Promise<XPublishResult> {
  if (tweets.length === 0) throw new Error("x_thread_empty");

  const ids: string[] = [];
  let prevId: string | undefined;

  for (const text of tweets) {
    try {
      const tweet = await postTweet(accessToken, text, prevId);
      ids.push(tweet.id);
      prevId = tweet.id;
    } catch (err) {
      // Partial thread: keep what succeeded, record failure
      throw new Error(
        `x_thread_partial: posted ${ids.length}/${tweets.length} tweets. Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const rootId = ids[0];
  return {
    url: `https://x.com/i/web/status/${rootId}`,
    tweetId: rootId,
    threadIds: ids,
  };
}

export function splitIntoThread(text: string): string[] {
  // If caption contains explicit tweet separators, use them
  if (text.includes("---TWEET---")) {
    return text.split("---TWEET---").map((t) => t.trim()).filter(Boolean);
  }
  // Otherwise treat as single tweet
  return [text];
}
