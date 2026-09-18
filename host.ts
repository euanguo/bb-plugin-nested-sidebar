import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { worktreeDirectoryContract } from "./host/contract.ts";
import { removeGitWorktree } from "./host/git-worktree.ts";
import { detectProjectIcon } from "./host/project-icon.ts";

/**
 * Nest's host entry: the commands it runs on the machine that owns a workspace.
 * Everything else the plugin does is a store or a decision, and those belong on
 * the server.
 */
export default experimental_defineHostEntry({
  contract: worktreeDirectoryContract,
  handlers: {
    removeWorktree: (input) => removeGitWorktree(input),
    /**
     * The detector answers `null` for a checkout with no icon, which is the
     * same answer as a checkout it could not read — but only one of those is
     * worth writing down as a probe that ran. So the throw is caught here, at
     * the boundary, and the server decides what to store.
     */
    detectProjectIcon: async (input) => {
      try {
        const icon = await detectProjectIcon(input.path);
        return icon === null
          ? { status: "none" as const }
          : { status: "found" as const, ...icon };
      } catch (error) {
        return {
          status: "failed" as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
});
