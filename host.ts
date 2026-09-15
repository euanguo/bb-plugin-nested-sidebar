import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { worktreeDirectoryContract } from "./host/contract.ts";
import { removeGitWorktree } from "./host/git-worktree.ts";

/**
 * Nest's host entry: the single command it runs on the machine that owns a
 * workspace. Everything else the plugin does is a store or a decision, and
 * those belong on the server.
 */
export default experimental_defineHostEntry({
  contract: worktreeDirectoryContract,
  handlers: {
    removeWorktree: (input) => removeGitWorktree(input),
  },
});
