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

// Tolerates surrounding markdown emphasis on the label (**VERDICT**:) and on
// the value (VERDICT: **APPROVE** — the form the agent actually emits, seen on
// PR #146), plus the common past-tense alias (APPROVED / CHANGES_REQUESTED).
const VERDICT_RE =
  /\**\s*VERDICT\s*\**:\s*\**\s*(APPROVE|APPROVED|REQUEST_CHANGES|CHANGES_REQUESTED|COMMENT)\b/gi;

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
 * Scan arbitrary text for the last VERDICT marker and return its event.
 *
 * Robust to WHERE in the transcript the agent emitted the marker: pass the
 * FULL output-file content (the whole conversation), not just the final
 * `result` line. The agent often writes VERDICT into a drafted review comment
 * rather than its terse result summary (seen on PR #149, where the result line
 * held only "— **APPROVE**." with no label → COMMENT fallback). Last match wins
 * (the agent's real verdict is the last one it emits). Missing/unknown → COMMENT.
 */
export function detectReviewEvents(text: string): ReviewEvent {
  const matches = [...(text ?? "").matchAll(VERDICT_RE)];
  const last = matches[matches.length - 1];
  return last && last[1] ? normalizeEvent(last[1]) : "COMMENT";
}

/** A non-empty review body fallback (Forgejo rejects empty comment bodies). */
export function fallbackReviewBody(event: ReviewEvent): string {
  return `Review posted (${EVENT_LABEL[event]}).`;
}

/**
 * Parse a result text into a review event + non-empty body. Missing or
 * ambiguous verdict → COMMENT (safe default).
 *
 * NOTE: for the EVENT, prefer `detectReviewEvents()` over the full transcript
 * — the marker may live outside the result line (see detectReviewEvents). This
 * helper pairs the event detected from `resultText` with a body derived from
 * the same text; it's kept for tests and standalone use.
 */
export function parseVerdict(resultText: string): ParsedVerdict {
  const text = resultText ?? "";
  const event = detectReviewEvents(text);

  // Everything before the verdict marker is the review body. The marker is the
  // last thing the agent emits, so slicing to the match drops only the marker.
  const matches = [...text.matchAll(VERDICT_RE)];
  const last = matches[matches.length - 1];
  let body = last && last.index !== undefined ? text.slice(0, last.index) : text;
  body = body.replace(/\s+$/, "");

  if (body.trim() === "") {
    body = fallbackReviewBody(event);
  }

  return { event, body };
}
