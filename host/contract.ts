import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { PROJECT_ICON_SOURCES } from "../lib/project-icons.ts";

/**
 * The two things this plugin needs a machine for.
 *
 * Removing a worktree's directory is not just deleting files: git keeps the
 * worktree's own record in the main repository, and a plain delete leaves that
 * record behind for `git worktree list` to trip over. So the removal runs where
 * the directory lives, through git when git is there.
 *
 * Reading a project's icon is the other, and it is here for a blunter reason:
 * the checkout's bytes are on that machine, and the plugin server cannot open a
 * file at all. A method that cannot open one is a method that cannot answer.
 *
 * Both travel in one contract because bb gives a plugin exactly one host entry,
 * and both are shape-only: the reasons to refuse an answer are decisions, and
 * decisions live on the server with the rest of them.
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
  /**
   * Probe a project's checkout for an icon it already ships.
   *
   * `none` is an answer, not a failure: most checkouts have no icon, and the
   * server stores it so the next sidebar mount does not ask again.
   */
  detectProjectIcon: {
    input: z.object({ path: z.string().min(1) }).strict(),
    output: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("found"),
          src: z.string().min(1),
          label: z.string(),
          source: z.enum(PROJECT_ICON_SOURCES),
        })
        .strict(),
      z.object({ status: z.literal("none") }).strict(),
      z
        .object({ status: z.literal("failed"), message: z.string().min(1) })
        .strict(),
    ]),
  },
});
