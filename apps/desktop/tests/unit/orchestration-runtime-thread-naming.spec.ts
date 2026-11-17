import { expect, test } from "@playwright/test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createOrchestrationRuntimeTools,
  type OrchestrationRuntimeBridge,
} from "../../electron/orchestration/orchestration-runtime";

interface RecordedCall {
  readonly method: string;
  readonly input: Record<string, unknown>;
}

interface ToolRunResult {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly details?: Record<string, unknown>;
}

function ok(details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: "ok" }], details };
}

function bridgeRecorder() {
  const calls: RecordedCall[] = [];
  const bridge = {
    archiveChildThreads: async (_ctx: unknown, threadIds: readonly string[]) => {
      calls.push({ method: "archiveChildThreads", input: { threadIds: [...threadIds] } });
      return ok({ action: "pi_gui_archive_child_threads", archived: [], skipped: [] });
    },
    createChildThread: async (_ctx: unknown, input: Record<string, unknown>) => {
      calls.push({ method: "createChildThread", input });
      return ok({ action: "pi_gui_create_child_thread", prompt: input.prompt });
    },
    listAgents: async () => ok({ action: "pi_gui_list_agents", workspaceId: "ws" }),
    runSubagent: async (_ctx: unknown, input: Record<string, unknown>) => {
      calls.push({ method: "runSubagent", input });
      return ok({ action: "pi_gui_subagent", status: "running" });
    },
    renameThread: async (_ctx: unknown, input: Record<string, unknown>) => {
      calls.push({ method: "renameThread", input });
      return ok({ action: "pi_gui_rename_thread", threadId: input.threadId, title: input.title });
    },
    listThreads: async () => ok({ action: "pi_gui_list_threads", threads: [] }),
    readThread: async (_ctx: unknown, threadId: string) =>
      ok({ action: "pi_gui_read_thread", threadId, messages: [] }),
    sendMessageToThread: async (_ctx: unknown, input: Record<string, unknown>) =>
      ok({ action: "pi_gui_send_message_to_thread", ...input, status: "sent" }),
  } as unknown as OrchestrationRuntimeBridge;
  return { bridge, calls };
}

function runTool(
  bridge: OrchestrationRuntimeBridge,
  name: string,
  params: Record<string, unknown>,
): Promise<ToolRunResult> {
  const tool = createOrchestrationRuntimeTools(bridge).find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Unknown orchestration tool: ${name}`);
  }
  return tool.execute(
    "call-1",
    params,
    undefined,
    undefined,
    {} as unknown as ExtensionContext,
  ) as unknown as Promise<ToolRunResult>;
}

test("create_child_thread forwards an explicit title and omits it when absent", async () => {
  const { bridge, calls } = bridgeRecorder();
  await runTool(bridge, "create_child_thread", {
    prompt: "Do the work",
    agent: "scout",
    title: "My named thread",
  });
  expect(calls[0]).toEqual({
    method: "createChildThread",
    input: {
      prompt: "Do the work",
      toolCallId: "call-1",
      agentName: "scout",
      title: "My named thread",
    },
  });

  calls.length = 0;
  await runTool(bridge, "create_child_thread", { prompt: "Do the work" });
  expect(calls[0]?.input).toEqual({ prompt: "Do the work", toolCallId: "call-1" });
});

test("subagent forwards an explicit title", async () => {
  const { bridge, calls } = bridgeRecorder();
  await runTool(bridge, "subagent", {
    task: "Investigate the bug",
    agent: "scout",
    async: true,
    title: "Scout investigation",
  });
  expect(calls[0]).toEqual({
    method: "runSubagent",
    input: {
      task: "Investigate the bug",
      foreground: false,
      toolCallId: "call-1",
      agent: "scout",
      title: "Scout investigation",
    },
  });
});

test("rename_thread forwards thread_id and title, and reports missing input", async () => {
  const { bridge, calls } = bridgeRecorder();
  await runTool(bridge, "rename_thread", { thread_id: "child-1", title: "New name" });
  expect(calls[0]).toEqual({
    method: "renameThread",
    input: { threadId: "child-1", title: "New name" },
  });

  calls.length = 0;
  const missingTitle = await runTool(bridge, "rename_thread", { thread_id: "child-1" });
  expect(calls).toEqual([]);
  expect(missingTitle.details).toMatchObject({
    action: "pi_gui_rename_thread",
    error: expect.stringContaining("thread_id and a non-empty title"),
  });
});
