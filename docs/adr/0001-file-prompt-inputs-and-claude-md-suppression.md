# File-based prompt inputs and CLAUDE.md suppression

The action's prompt inputs (`custom_instructions`, `direct_prompt`) are inline
strings only. Consumers that want to version, review, and reuse prompts as files
in the repo — and to keep a CI review agent from being steered by the repo's
dev-facing `CLAUDE.md` — have no clean way to do either: there is no per-field
file input, and Claude Code auto-loads the committed `CLAUDE.md` with no
documented off-switch (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` affects only
auto-memory, not the committed file).

Decision (2026-07-22): add three inputs to the fork.

- `custom_instructions_file`, `direct_prompt_file` (paths, default `""`): when
  set, the file's contents are read in `src/github/context.ts`
  (`resolveInputFileOrInline`) and take precedence over the inline
  `custom_instructions` / `direct_prompt`. Paths resolve relative to
  `GITHUB_WORKSPACE` (or absolute). A missing file throws, so a misconfigured
  `*_file` fails loudly instead of silently falling back. Every prompt-bearing
  input now has a `*_file` variant.
- `suppress_claude_md` (bool, default `false`): when `true`, a workflow step
  removes `CLAUDE.md` and `.claude/CLAUDE.md` from the workspace before Claude
  Code runs, and the prompt builder omits its "follow the repository's CLAUDE.md"
  instructions. Both halves are needed: removing the file stops Claude Code's
  auto-load, and dropping the prompt lines stops the action from telling Claude
  to follow a file that is no longer there.

The persona therefore rides in-prompt via `*_file` (highest attention);
`CLAUDE.md` is suppressed, not swapped.

## Considered

- **Workflow-level CLAUDE.md swap (`rm` + `cp` to a curated file).** Rejected:
  the persona would land in the Memory slot (lower attention) and it is a
  consumer-side workflow hack. Suppression + in-prompt `*_file` is cleaner and
  lives in the action.
- **Settings-based suppression (`claudeMdExcludes`).** Rejected as unreliable:
  it targets monorepo "other-team" files and is unverified for the root project
  `CLAUDE.md`. Removing the file is deterministic.
- **Required `suppressClaudeMd` on the parsed context type.** Made optional:
  test mocks construct `inputs` literals without it; the field defaults to falsy
  (no suppression = upstream behavior), so optional avoids mock churn while
  `parseGitHubContext` always sets it in production.

## Revert

Drop the three inputs and the `resolveInputFileOrInline` helper; restore the two
unconditional "follow CLAUDE.md" prompt lines in `src/create-prompt/index.ts`.
Viable if file-based prompts or CLAUDE.md suppression are no longer needed.
