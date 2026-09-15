import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/**
 * The one thing this plugin needs a machine for.
 *
 * Removing a worktree's directory is not just deleting files: git keeps the
 * worktree's own record in the main repository, and a plain delete leaves that
 * record behind for `git worktree list` to trip over. So the removal runs where
 * the directory lives, through git when git is there.
 */
export const worktreeDirectoryContract = defineRpcContract({
  removeWorktree: {
    input: z
      .object({
        path: z.string().min(1),
        mainRepoPath: z.string().min(1),
      })
      .strict(),
    output: z.discriminatedUnion("status", [
      z.object({ status: z.literal("removed") }).strict(),
      /**
       * git will not take this one — the directory is not a worktree of that
       * repository, or git is not installed — so the caller has to delete it
       * plainly and say what it could not clean up.
       */
      z
        .object({ status: z.literal("fallback"), reason: z.string().min(1) })
        .strict(),
      z
        .object({ status: z.literal("failed"), message: z.string().min(1) })
        .strict(),
    ]),
  },
});
