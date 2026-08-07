/**
 * Verdict parser for `posting_mode: review`.
 *
 * The review agent ends its result text with a single machine-readable verdict
 * marker; this module extracts it and yields the Forgejo review `event` plus a
 * non-empty body. Forgejo rejects empty comment-review bodies ("body is empty"),
 * so the body is guaranteed non-empty (spike 2026-08-07, #143).
 *
 * Marker (last occurrence wins, case-insensitive; markdown bold tolerated):
 *   VERDICT: APPROVE | REQUEST_CHANGES | COMMENT
 *
 * The marker carries reviewer-friendly verbs; the returned `event` uses the
 * Forgejo/SDK POST values (APPROVED / REQUEST_CHANGES / COMMENT).
 */

export type ReviewEvent = 'APPROVED' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ParsedVerdict {
  event: ReviewEvent;
  body: string;
}

// Tolerates surrounding markdown emphasis (**VERDICT**:) and the common
// past-tense alias (APPROVED / CHANGES_REQUESTED).
const VERDICT_RE =
  /\**\s*VERDICT\s*\**:\s*(APPROVE|APPROVED|REQUEST_CHANGES|CHANGES_REQUESTED|COMMENT)\b/gi;

const EVENT_LABEL: Record<ReviewEvent, string> = {
  APPROVED: 'Approve',
  REQUEST_CHANGES: 'Request changes',
  COMMENT: 'Comment',
};

function normalizeEvent(token: string): ReviewEvent {
  switch (token.toUpperCase().replace(/[-\s]/g, '_')) {
    case 'APPROVE':
    case 'APPROVED':
      return 'APPROVED';
    case 'REQUEST_CHANGES':
    case 'CHANGES_REQUESTED':
      return 'REQUEST_CHANGES';
    default:
      return 'COMMENT';
  }
}

/**
 * Parse the agent's final result text into a review event + non-empty body.
 * Missing or ambiguous verdict → COMMENT (safe default).
 */
export function parseVerdict(resultText: string): ParsedVerdict {
  const text = resultText ?? '';

  const matches = [...text.matchAll(VERDICT_RE)];
  const last = matches[matches.length - 1];
  const event: ReviewEvent = last && last[1] ? normalizeEvent(last[1]) : 'COMMENT';

  // Everything before the verdict marker is the review body. The marker is the
  // last thing the agent emits, so slicing to the match drops only the marker.
  let body = last && last.index !== undefined ? text.slice(0, last.index) : text;
  body = body.replace(/\s+$/, '');

  if (body.trim() === '') {
    body = `Review posted (${EVENT_LABEL[event]}).`;
  }

  return { event, body };
}
