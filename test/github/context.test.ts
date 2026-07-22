import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseMultilineInput,
  parseAdditionalPermissions,
  resolveInputFileOrInline,
} from "../../src/github/context";

describe("parseMultilineInput", () => {
  it("should parse a comma-separated string", () => {
    const input = `Bash(bun install),Bash(bun test:*),Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse multiline string", () => {
    const input = `Bash(bun install)
Bash(bun test:*)
Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse comma-separated multiline line", () => {
    const input = `Bash(bun install),Bash(bun test:*)
Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should ignore comments", () => {
    const input = `Bash(bun install),
Bash(bun test:*) # For testing
# For type checking
Bash(bun typecheck)
`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse an empty string", () => {
    const input = "";
    const result = parseMultilineInput(input);
    expect(result).toEqual([]);
  });
});

describe("parseAdditionalPermissions", () => {
  it("should parse single permission", () => {
    const input = "actions: read";
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.size).toBe(1);
  });

  it("should parse multiple permissions", () => {
    const input = `actions: read
packages: write
contents: read`;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.get("contents")).toBe("read");
    expect(result.size).toBe(3);
  });

  it("should handle empty string", () => {
    const input = "";
    const result = parseAdditionalPermissions(input);
    expect(result.size).toBe(0);
  });

  it("should handle whitespace and empty lines", () => {
    const input = `
    actions: read

    packages: write
    `;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.size).toBe(2);
  });

  it("should ignore lines without colon separator", () => {
    const input = `actions: read
invalid line
packages: write`;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.size).toBe(2);
  });

  it("should trim whitespace around keys and values", () => {
    const input = "  actions  :  read  ";
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.size).toBe(1);
  });
});

describe("resolveInputFileOrInline", () => {
  let tmpDir: string;
  let prevWorkspace: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-input-"));
    prevWorkspace = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (prevWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE;
    } else {
      process.env.GITHUB_WORKSPACE = prevWorkspace;
    }
  });

  it("returns the inline value when no file path is given", () => {
    expect(resolveInputFileOrInline("inline-instructions", "")).toBe(
      "inline-instructions",
    );
  });

  it("reads file contents relative to GITHUB_WORKSPACE when a path is set", () => {
    fs.writeFileSync(path.join(tmpDir, "review.md"), "file-instructions");
    expect(resolveInputFileOrInline("inline-instructions", "review.md")).toBe(
      "file-instructions",
    );
  });

  it("lets the file take precedence over the inline value", () => {
    fs.writeFileSync(path.join(tmpDir, "review.md"), "from-file");
    expect(resolveInputFileOrInline("ignored-inline", "review.md")).toBe(
      "from-file",
    );
  });

  it("resolves an absolute path", () => {
    const abs = path.join(tmpDir, "abs.md");
    fs.writeFileSync(abs, "absolute-content");
    expect(resolveInputFileOrInline("", abs)).toBe("absolute-content");
  });

  it("throws when the file does not exist", () => {
    expect(() => resolveInputFileOrInline("", "missing.md")).toThrow(
      /Prompt file not found/,
    );
  });
});
