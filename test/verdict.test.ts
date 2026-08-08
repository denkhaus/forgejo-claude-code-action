import { describe, it, expect } from "bun:test";
import { parseVerdict, detectReviewEvents } from "../src/github/operations/reviews/verdict";

describe("parseVerdict", () => {
  it("maps APPROVE marker to APPROVED and strips it from the body", () => {
    const { event, body } = parseVerdict("Looks good.\n\nVERDICT: APPROVE");
    expect(event).toBe("APPROVED");
    expect(body).toBe("Looks good.");
  });

  it("maps REQUEST_CHANGES marker", () => {
    const { event, body } = parseVerdict("Fix the bug.\n\nVERDICT: REQUEST_CHANGES");
    expect(event).toBe("REQUEST_CHANGES");
    expect(body).toBe("Fix the bug.");
  });

  it("maps COMMENT marker", () => {
    const { event, body } = parseVerdict("Nice work.\n\nVERDICT: COMMENT");
    expect(event).toBe("COMMENT");
    expect(body).toBe("Nice work.");
  });

  it("is case-insensitive", () => {
    const { event } = parseVerdict("verdict: approve");
    expect(event).toBe("APPROVED");
  });

  it("tolerates markdown bold around the marker", () => {
    const { event, body } = parseVerdict("All good.\n\n**VERDICT**: APPROVE");
    expect(event).toBe("APPROVED");
    expect(body).toBe("All good.");
  });

  it("tolerates markdown bold around the verdict VALUE", () => {
    // The agent emits "Verdict: **APPROVE**" (bold on the value, not the label)
    // — the form observed on PR #146. Must still map to APPROVED and strip the
    // marker (incl. the trailing **) from the body.
    const { event, body } = parseVerdict("Looks good.\n\nVerdict: **APPROVE**");
    expect(event).toBe("APPROVED");
    expect(body).toBe("Looks good.");
  });

  it("accepts the past-tense aliases APPROVED / CHANGES_REQUESTED", () => {
    expect(parseVerdict("VERDICT: APPROVED").event).toBe("APPROVED");
    expect(parseVerdict("VERDICT: CHANGES_REQUESTED").event).toBe("REQUEST_CHANGES");
  });

  it("defaults to COMMENT when no marker is present", () => {
    const { event, body } = parseVerdict("Just a review with no verdict line.");
    expect(event).toBe("COMMENT");
    expect(body).toBe("Just a review with no verdict line.");
  });

  it("defaults to COMMENT for an unknown verdict token", () => {
    const { event } = parseVerdict("VERDICT: NEEDS_INFO");
    expect(event).toBe("COMMENT");
  });

  it("takes the last marker when multiple are present", () => {
    const { event } = parseVerdict("VERDICT: COMMENT\n\nActually fixed.\n\nVERDICT: APPROVE");
    expect(event).toBe("APPROVED");
  });

  it("guarantees a non-empty body when only the marker is present", () => {
    const { event, body } = parseVerdict("VERDICT: APPROVE");
    expect(event).toBe("APPROVED");
    expect(body.trim()).not.toBe("");
  });

  it("guarantees a non-empty body for empty/whitespace input", () => {
    const { event, body } = parseVerdict("   ");
    expect(event).toBe("COMMENT");
    expect(body.trim()).not.toBe("");
  });
});

describe("detectReviewEvents", () => {
  it("returns COMMENT when no marker is present", () => {
    expect(detectReviewEvents("just a summary with no marker")).toBe("COMMENT");
  });

  it("finds a marker in a single line", () => {
    expect(detectReviewEvents("Review text.\n\nVERDICT: APPROVE")).toBe("APPROVED");
    expect(detectReviewEvents("VERDICT: REQUEST_CHANGES")).toBe("REQUEST_CHANGES");
  });

  it("regression #149: detects the verdict from the FULL transcript when the result line lacks the label", () => {
    // The agent wrote "VERDICT: APPROVE" into its drafted review comment, but
    // its final result line was only a terse summary with "**APPROVE**" and no
    // VERDICT label. parseVerdict on just the result line falls back to COMMENT;
    // detectReviewEvents on the whole transcript finds APPROVED.
    const transcript = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","input":{"body":"### Review\\n\\nNo findings.\\n\\nVERDICT: APPROVE"}}]}}',
      '{"type":"result","result":"Review posted. Clean version bump — **APPROVE**."}',
    ].join("\n");

    const resultLine = "Review posted. Clean version bump — **APPROVE**.";

    // The bug: parsing only the result line misses the marker.
    expect(parseVerdict(resultLine).event).toBe("COMMENT");
    // The fix: scanning the full transcript finds it.
    expect(detectReviewEvents(transcript)).toBe("APPROVED");
  });

  it("last marker wins across a multi-message transcript", () => {
    const transcript = [
      "VERDICT: COMMENT",
      "actually reconsidered",
      "VERDICT: REQUEST_CHANGES",
    ].join("\n\n");
    expect(detectReviewEvents(transcript)).toBe("REQUEST_CHANGES");
  });
});
