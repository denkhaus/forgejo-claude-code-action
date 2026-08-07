import { describe, it, expect } from "bun:test";
import { parseVerdict } from "../src/github/operations/reviews/verdict";

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
