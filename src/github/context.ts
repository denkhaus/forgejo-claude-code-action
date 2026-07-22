import * as github from "@actions/github";
import type {
  IssuesEvent,
  IssuesAssignedEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
} from "@octokit/webhooks-types";
import type { ModeName } from "../modes/types";
import { DEFAULT_MODE, isValidMode } from "../modes/registry";
import { detectPlatform, Platform } from "../platform/detector";
import { isForgejoIssuePR } from "../forgejo/context";
import * as fs from "fs";
import * as path from "path";

export type ParsedGitHubContext = {
  runId: string;
  eventName: string;
  eventAction?: string;
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  actor: string;
  payload:
    | IssuesEvent
    | IssueCommentEvent
    | PullRequestEvent
    | PullRequestReviewEvent
    | PullRequestReviewCommentEvent;
  entityNumber: number;
  isPR: boolean;
  inputs: {
    mode: ModeName;
    triggerPhrase: string;
    assigneeTrigger: string;
    labelTrigger: string;
    allowedTools: string[];
    disallowedTools: string[];
    customInstructions: string;
    directPrompt: string;
    overridePrompt: string;
    baseBranch?: string;
    branchPrefix: string;
    useStickyComment: boolean;
    additionalPermissions: Map<string, string>;
    useCommitSigning: boolean;
    // Optional because mocks omit it; parseGitHubContext always sets it.
    suppressClaudeMd?: boolean;
  };
};

export function parseGitHubContext(): ParsedGitHubContext {
  const context = github.context;

  const modeInput = process.env.MODE ?? DEFAULT_MODE;
  if (!isValidMode(modeInput)) {
    throw new Error(`Invalid mode: ${modeInput}.`);
  }

  const platformConfig = detectPlatform();
  const runId =
    platformConfig.platform === Platform.Forgejo
      ? process.env.GITHUB_RUN_NUMBER!
      : process.env.GITHUB_RUN_ID!;

  const commonFields = {
    runId: runId,
    eventName: context.eventName,
    eventAction: context.payload.action,
    repository: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      full_name: `${context.repo.owner}/${context.repo.repo}`,
    },
    actor: context.actor,
    inputs: {
      mode: modeInput as ModeName,
      triggerPhrase: process.env.TRIGGER_PHRASE ?? "@claude",
      assigneeTrigger: process.env.ASSIGNEE_TRIGGER ?? "",
      labelTrigger: process.env.LABEL_TRIGGER ?? "",
      allowedTools: parseMultilineInput(process.env.ALLOWED_TOOLS ?? ""),
      disallowedTools: parseMultilineInput(process.env.DISALLOWED_TOOLS ?? ""),
      customInstructions: resolveInputFileOrInline(
        process.env.CUSTOM_INSTRUCTIONS ?? "",
        process.env.CUSTOM_INSTRUCTIONS_FILE ?? "",
      ),
      directPrompt: resolveInputFileOrInline(
        process.env.DIRECT_PROMPT ?? "",
        process.env.DIRECT_PROMPT_FILE ?? "",
      ),
      suppressClaudeMd: process.env.SUPPRESS_CLAUDE_MD === "true",
      overridePrompt: process.env.OVERRIDE_PROMPT ?? "",
      baseBranch: process.env.BASE_BRANCH,
      branchPrefix: process.env.BRANCH_PREFIX ?? "claude/",
      useStickyComment: process.env.USE_STICKY_COMMENT === "true",
      additionalPermissions: parseAdditionalPermissions(
        process.env.ADDITIONAL_PERMISSIONS ?? "",
      ),
      useCommitSigning: process.env.USE_COMMIT_SIGNING === "true",
    },
  };

  switch (context.eventName) {
    case "issues": {
      return {
        ...commonFields,
        payload: context.payload as IssuesEvent,
        entityNumber: (context.payload as IssuesEvent).issue.number,
        isPR: false,
      };
    }
    case "issue_comment": {
      const platformConfig = detectPlatform();
      const issueCommentPayload = context.payload as IssueCommentEvent;

      // For Forgejo, use custom PR detection
      const isPR =
        platformConfig.platform === Platform.Forgejo
          ? isForgejoIssuePR(context)
          : Boolean(issueCommentPayload.issue.pull_request);

      return {
        ...commonFields,
        payload: issueCommentPayload,
        entityNumber: issueCommentPayload.issue.number,
        isPR,
      };
    }
    case "pull_request": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestEvent,
        entityNumber: (context.payload as PullRequestEvent).pull_request.number,
        isPR: true,
      };
    }
    case "pull_request_review": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewEvent,
        entityNumber: (context.payload as PullRequestReviewEvent).pull_request
          .number,
        isPR: true,
      };
    }
    case "pull_request_review_comment": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewCommentEvent,
        entityNumber: (context.payload as PullRequestReviewCommentEvent)
          .pull_request.number,
        isPR: true,
      };
    }
    default:
      throw new Error(`Unsupported event type: ${context.eventName}`);
  }
}

export function parseMultilineInput(s: string): string[] {
  return s
    .split(/,|[\n\r]+/)
    .map((tool) => tool.replace(/#.+$/, ""))
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);
}

/**
 * Resolve a prompt input from a file path or an inline string. If `filePath`
 * is set, its contents are read (relative to GITHUB_WORKSPACE, or absolute)
 * and take precedence over `inline`. Throws if the file is missing so a
 * misconfigured `*_file` input fails loudly instead of silently falling back.
 */
export function resolveInputFileOrInline(
  inline: string,
  filePath: string,
): string {
  if (!filePath) {
    return inline;
  }
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspace, filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Prompt file not found: ${filePath} (resolved: ${resolved})`,
    );
  }
  return fs.readFileSync(resolved, "utf8");
}

export function parseAdditionalPermissions(s: string): Map<string, string> {
  const permissions = new Map<string, string>();
  if (!s || !s.trim()) {
    return permissions;
  }

  const lines = s.trim().split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      const [key, value] = trimmedLine.split(":").map((part) => part.trim());
      if (key && value) {
        permissions.set(key, value);
      }
    }
  }
  return permissions;
}

export function isIssuesEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssuesEvent } {
  return context.eventName === "issues";
}

export function isIssueCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssueCommentEvent } {
  return context.eventName === "issue_comment";
}

export function isPullRequestEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestEvent } {
  return context.eventName === "pull_request";
}

export function isPullRequestReviewEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewEvent } {
  return context.eventName === "pull_request_review";
}

export function isPullRequestReviewCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewCommentEvent } {
  return context.eventName === "pull_request_review_comment";
}

export function isIssuesAssignedEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssuesAssignedEvent } {
  return isIssuesEvent(context) && context.eventAction === "assigned";
}
