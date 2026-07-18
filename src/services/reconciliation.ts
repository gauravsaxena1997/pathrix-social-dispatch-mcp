export interface ReconciliationMediaCandidate {
  id: string;
  caption?: string | null;
  mediaType?: string | string[] | null;
  timestamp?: string | null;
}

export interface ReconciliationInput {
  captionText: string;
  mediaType?: string | null;
  expectedPublishAt: Date;
  toleranceMs?: number;
}

function normalizeCaption(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function createSocialReconciliationService() {
  return {
    matchInstagramMedia(input: ReconciliationInput, candidates: ReconciliationMediaCandidate[]) {
      const normalizedCaption = normalizeCaption(input.captionText);
      const toleranceMs = input.toleranceMs ?? 30 * 60 * 1000;
      const matches = candidates.filter((candidate) => {
        const caption = normalizeCaption(candidate.caption ?? "");
        const timestamp = candidate.timestamp ? Date.parse(candidate.timestamp) : Number.NaN;
        const timestampMatches = Number.isNaN(timestamp)
          || Math.abs(timestamp - input.expectedPublishAt.getTime()) <= toleranceMs;
        const candidateTypes = Array.isArray(candidate.mediaType)
          ? candidate.mediaType
          : candidate.mediaType ? [candidate.mediaType] : [];
        const typeMatches = !input.mediaType
          || candidateTypes.length === 0
          || candidateTypes.includes(input.mediaType);
        return normalizedCaption.length > 0
          && caption.includes(normalizedCaption)
          && timestampMatches
          && typeMatches;
      });

      return {
        status: matches.length === 1 ? "matched" as const : matches.length > 1 ? "ambiguous" as const : "pending" as const,
        matchedMediaId: matches.length === 1 ? matches[0].id : undefined,
        candidates: matches,
      };
    },
  };
}
