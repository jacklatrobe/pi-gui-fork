---
name: agent-identities
description: "Agent identities on pi-gui threads: choosing one in New thread, delegating to one through tools, and the replacement of pi-subagents' hidden delegation."
---

# Agent identities

A thread can start as an **agent identity**: a pi-subagents-style markdown agent whose
body becomes an appended system prompt, whose frontmatter can narrow the tool set, and
whose model/thinking are fallbacks for a thread that chose none. The same identities are
what `subagent` delegates to, so a delegation always shows up as a thread in the sidebar.

## Entry points

- New thread: the `Agent` badge beside the model picker
  (`apps/desktop/src/features/threads/agent-selector.tsx`). `Default` starts pi-gui's
  ordinary session with no agent prompt.
- Running threads: the read-only `Agent · <name>` badge in the composer footer, and the
  small name chip on the sidebar row.
- Agent tools: `list_agents` (names, descriptions, source, tools, model),
  `create_child_thread` with an `agent` parameter, and `subagent`
  (`apps/desktop/electron/orchestration/orchestration-runtime.ts`). `list_threads` reports
  each thread's agent.

## Where identities come from

`apps/desktop/electron/agents/agent-identity-catalog.ts` reads, lowest priority first:

| Scope   | Path                                                                 |
| ------- | -------------------------------------------------------------------- |
| builtin | `<agentDir>/extensions/subagent/agents/**/*.md`                      |
| package | `<agentDir>/npm/node_modules/pi-subagents/agents/**/*.md`            |
| user    | `<agentDir>/agents/**/*.md`                                          |
| project | `<workspace>/.agents/**/*.md`, then `<workspace>/.pi/agents/**/*.md` |

`subagents.agentOverrides` from global and project settings is applied last; a disabled
override hides the agent. Nothing is cached, so a new markdown file shows up on the next
New thread or tool call.

## Delegation replacement

pi-gui owns delegation. The pi-subagents extension is filtered out of pi-gui session
loading (`packages/pi-sdk-driver/src/superseded-extensions.ts`), so its `subagent` tool
cannot start a hidden child session; pi-gui's `subagent` tool creates a real thread
instead. Async delegation returns the thread id immediately, `async: false` waits for the
child and returns its reply, and `action: "list"` lists identities.

## Executable coverage

- Core Electron: `apps/desktop/tests/core/agent-identities.spec.ts` drives the New thread
  picker, the session badge, `list_agents`, `create_child_thread` with `agent`, `subagent`,
  and `list_threads` agent labels against a hanging provider.
- Unit: `apps/desktop/tests/unit/agent-identity-catalog.spec.ts` (discovery, precedence,
  overrides, frontmatter parsing) and
  `packages/pi-sdk-driver/test/superseded-extensions.test.mts` (pi-subagents is not loaded).
- No `prove.sh` lane yet; a real-provider run is needed to observe the identity prompt
  reaching the model.

## Outstanding

- Foreground `subagent` (`async: false`) waits for the child run
  (`SUBAGENT_FOREGROUND_TIMEOUT_MS`, 30 minutes) but has no test; the fixture provider
  never settles. A scripted provider that answers once would let the test assert `reply`.
- The agent's `model`/`thinking` fallback is applied in
  `packages/pi-sdk-driver/src/session-supervisor.ts` but not covered at runtime.
- `forkThread` does not resolve the source thread's identity, so a fork keeps the catalog
  label and the copied `pi-gui.agent-identity` entry, but a fork into a fresh branch does
  not re-append the agent prompt. Wire it through `store.resolveAgentIdentity` if needed.
- `subagent` covers single-agent delegation, `async` and `action: "list"`. Workflows,
  chains, parallel fan-out, missions, `bg_wait` and `context: "fork"` are not ported.
