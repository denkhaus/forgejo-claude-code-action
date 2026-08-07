import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { Octokit } from "@octokit/rest";

/**
 * Check if the actor has write permissions to the repository
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @returns true if the actor has write permissions, false otherwise
 */
export async function checkWritePermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const { repository, actor } = context;

  try {
    core.info(`Checking permissions for actor: ${actor}`);

    // Check permissions directly using the permission endpoint
    const response = await octokit.repos.getCollaboratorPermissionLevel({
      owner: repository.owner,
      repo: repository.repo,
      username: actor,
    });

    const permissionLevel = response.data.permission;
    core.info(`Permission level retrieved: ${permissionLevel}`);

    // Accept various permission levels that indicate write access
    // GitHub uses: admin, write, read
    // Forgejo uses: owner, admin, write, read
    const writePermissions = ["admin", "write", "owner", "maintain"];
    
    if (writePermissions.includes(permissionLevel)) {
      core.info(`Actor has write access: ${permissionLevel}`);
      return true;
    } else {
      core.warning(`Actor has insufficient permissions: ${permissionLevel}`);
      return false;
    }
  } catch (error: any) {
    // Forgejo: a non-admin collaborator token can query only its OWN permission,
    // so querying the triggering actor's permission returns 403
    // ("collaborators can query only their own"); 404 means the endpoint isn't
    // available. Both are token/endpoint limits, NOT evidence the actor lacks
    // write access — skip the check on Forgejo. (Defense-in-depth only: the
    // review-agent fires per-workflow regardless, and @claude gating is already
    // best-effort when a non-admin bot token is used.)
    if (error.status === 403 || error.status === 404) {
      const platformConfig = (await import("../../platform/detector")).detectPlatform();
      if (platformConfig.platform === "forgejo") {
        core.warning(
          `Permission check skipped on Forgejo (${error.status}): cannot verify actor '${actor}' permission with this token — proceeding.`,
        );
        return true;
      }
    }

    core.error(`Failed to check permissions: ${error}`);
    throw new Error(`Failed to check permissions for ${actor}: ${error}`);
  }
}
