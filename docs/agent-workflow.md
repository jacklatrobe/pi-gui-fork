# Agent contribution workflow

How an autonomous agent (the pi-gui harness, Claude, or Codex) proposes and lands
changes without disrupting other work. Pairs with [ci-baseline.md](ci-baseline.md)
(what each check proves) and [merge-enforcement.md](merge-enforcement.md) (how the
`CI required` gate blocks merges).

## Repository topology

| Remote   | URL                                   | Role                               |
| -------- | ------------------------------------- | ---------------------------------- |
| `origin` | `github.com/minghinmatthewlam/pi-gui` | Upstream; never push directly.     |
| `fork`   | `github.com/jacklatrobe/pi-gui-fork`  | Where agent branches and PRs live. |

The fork credential lives outside the repo (locally in `~/.pi/agent/.env` and
`~/.git-credentials`). Never commit a token, and never print it into a transcript
or CI log.

## The golden loop

1. **Isolate.** Create a worktree and branch per task; never switch the shared
   checkout's branch out from under another agent. The harness already provisions
   worktrees under `.../pi/worktrees/pi-gui/`.
   ```sh
   git worktree add ../pi-gui-wt <new-branch> fork/main
   ```
2. **Orient.** Read the root `AGENTS.md`, any nested `AGENTS.md` for the paths you
   will touch, and the relevant plan in `plans/`.
3. **Reproduce / specify.** Name the user flow, the observable result, and the
   failure cases before editing.
4. **Implement small.** One focused change set per branch; commit in checkpoints.
5. **Verify locally** using the ladder below.
6. **Push and open a PR against the fork.**
   ```sh
   git push fork HEAD
   gh pr create --repo jacklatrobe/pi-gui-fork --fill
   ```
7. **Wait for `CI required`.** It aggregates the baseline, coverage,
   windows-quality, website, core E2E and packaging jobs. A red gate means fix and
   push again; do not merge around it.
8. **Merge and clean up.** Delete the branch and remove the worktree.

## Local verification ladder

Run the cheapest check that can catch your change first, and widen as confidence
grows. Stop at the first failure and read its message.

| Rung | Command                                           | Proves                                     |
| ---- | ------------------------------------------------- | ------------------------------------------ |
| 1    | `node --test <file>.test.mjs`                     | A single guard/unit file.                  |
| 2    | `pnpm test:guards`                                | Policy, architecture and discovery guards. |
| 3    | `pnpm test:coverage`                              | Node lanes plus the coverage floor.        |
| 4    | `pnpm --filter @pi-gui/desktop run test:e2e:core` | Real Electron conversation flows.          |
| 5    | `pnpm check`                                      | The full Ubuntu baseline.                  |

Desktop behavior is not done until it is seen on the real Electron surface. Use
[`.agents/skills/verify-pi-gui`](../.agents/skills/verify-pi-gui/SKILL.md) for
conversation flows and
[`.agents/skills/testing-windows-desktop`](../.agents/skills/testing-windows-desktop/SKILL.md)
on Windows.

## Working safely alongside other agents

- **Treat files you did not edit as read-only.** If two agents share a checkout,
  coordinate by path, not by branch switching.
- **Do not rewrite history** on shared branches, and do not force-push `main`.
- **Prefer path-scoped `AGENTS.md` guidance** over growing the root file.
- **Keep the CI contract honest.** Adding or renaming a job in
  `.github/workflows/ci.yml` requires updating `requiredJobs` in
  `scripts/check-ci-results.mjs`; `scripts/check-ci-results.test.mjs` fails
  otherwise. New actions must fit `scripts/workflow-action-policy.mjs`.
- **Surface, don't hide, failures.** Report the exact error text and the command
  that produced it so a human can reproduce.

## Cost and external-side-effect guardrails

These are hard limits, not preferences. Never spend real money on a hosted
service, never exfiltrate data, and never touch anything outside the user's own
machines and already-wired cloud accounts. Run local models and self-hosted tools
first. See the global `AGENTS.md` for the full policy.

## Rollback

Each change is one branch and one focused commit set. To undo:

```sh
git revert <merge-sha>   # on main, after the fact
```

or simply drop the branch if it was never merged. Never delete another author's
session history, transcripts, screenshots, or artifacts without approval.
