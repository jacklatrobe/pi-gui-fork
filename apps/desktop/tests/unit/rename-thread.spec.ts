import { expect, test } from "@playwright/test";
import type { SessionRef } from "@pi-gui/session-driver";
import type { OrchestrationChildThread } from "../../contracts/desktop-state";
import { createOrchestrationOwner } from "../../electron/orchestration/app-store-orchestration";

const timestamp = "2026-10-26T00:00:00.000Z";

function link(id: string, parentSessionId: string): OrchestrationChildThread {
  return {
    id,
    parentWorkspaceId: "ws",
    parentSessionId,
    childWorkspaceId: "ws",
    childSessionId: id,
    title: `Title of ${id}`,
    goal: id,
    status: "complete",
    latestTranscript: "",
    transcript: [],
    evidence: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fixture() {
  let children: readonly OrchestrationChildThread[] = [
    link("child", "parent"),
    link("grandchild", "child"),
  ];
  const renamed: { readonly sessionId: string; readonly title: string }[] = [];
  const clearedPendingTitles: string[] = [];
  const host = {
    initialize: async () => undefined,
    orchestrationChildren: () => children,
    orchestrationState: () => ({ workspaces: [], orchestrationChildren: children }),
    replaceOrchestrationChildren: (next: readonly OrchestrationChildThread[]) => {
      children = next;
    },
    sessionFromState: (ref: SessionRef) => ({
      title: `Title of ${ref.sessionId}`,
      status: "idle",
      updatedAt: timestamp,
    }),
    clearPendingAutoTitle: (ref: SessionRef) => {
      clearedPendingTitles.push(ref.sessionId);
    },
    driver: {
      renameSession: async (ref: SessionRef, title: string) => {
        renamed.push({ sessionId: ref.sessionId, title });
      },
    },
    refreshState: async () => undefined,
    persistUiState: async () => undefined,
    emit: () => undefined,
  };
  return {
    owner: createOrchestrationOwner(
      host as unknown as Parameters<typeof createOrchestrationOwner>[0],
    ),
    renamed,
    clearedPendingTitles,
    children: () => children,
  };
}

const parentRef = { workspaceId: "ws", sessionId: "parent" };

test("renames a direct child and records the previous title", async () => {
  const f = fixture();
  const result = await f.owner.renameThreadToolResult(parentRef, {
    threadId: "child",
    title: "  Fresh name  ",
  });
  expect(result.details).toMatchObject({
    action: "pi_gui_rename_thread",
    threadId: "child",
    title: "Fresh name",
    previousTitle: "Title of child",
  });
  expect(f.renamed).toEqual([{ sessionId: "child", title: "Fresh name" }]);
  // A pending auto title would otherwise overwrite the manual name on the next turn.
  expect(f.clearedPendingTitles).toEqual(["child"]);
  expect(f.children().find((child) => child.id === "child")?.title).toBe("Fresh name");
});

test("refuses to rename a thread that is not the caller's direct child", async () => {
  const f = fixture();
  const parent = await f.owner.renameThreadToolResult(parentRef, {
    threadId: "parent",
    title: "Nope",
  });
  expect(parent.details.error).toBe("Only direct child threads of this thread can be renamed.");
  const grandchild = await f.owner.renameThreadToolResult(parentRef, {
    threadId: "grandchild",
    title: "Nope",
  });
  expect(grandchild.details.error).toBe("Only direct child threads of this thread can be renamed.");
  expect(f.renamed).toEqual([]);
});

test("rejects an empty or overlong title without touching the driver", async () => {
  const f = fixture();
  const empty = await f.owner.renameThreadToolResult(parentRef, {
    threadId: "child",
    title: "   ",
  });
  expect(empty.details.error).toBe("rename_thread requires a non-empty title.");
  const long = await f.owner.renameThreadToolResult(parentRef, {
    threadId: "child",
    title: "x".repeat(121),
  });
  expect(long.details.error).toBe("Thread title must be 120 characters or fewer.");
  expect(f.renamed).toEqual([]);
});
