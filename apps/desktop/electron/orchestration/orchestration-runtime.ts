import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import type { AgentIdentityRecord } from "../../contracts/agents";

export const createChildThreadToolName = "create_child_thread";
export const createChildThreadAction = "pi_gui_create_child_thread";
export const listAgentsToolName = "list_agents";
export const listAgentsAction = "pi_gui_list_agents";
export const subagentToolName = "subagent";
export const subagentAction = "pi_gui_subagent";
export const listThreadsToolName = "list_threads";
export const listThreadsAction = "pi_gui_list_threads";
export const readThreadToolName = "read_thread";
export const readThreadAction = "pi_gui_read_thread";
export const sendMessageToThreadToolName = "send_message_to_thread";
export const sendMessageToThreadAction = "pi_gui_send_message_to_thread";
export const archiveChildThreadsToolName = "archive_child_threads";
export const archiveChildThreadsAction = "pi_gui_archive_child_threads";

/** Every pi-gui thread tool. Their names are not file or search tools, whatever they contain. */
export const orchestrationToolNames: ReadonlySet<string> = new Set([
  createChildThreadToolName,
  listAgentsToolName,
  listThreadsToolName,
  subagentToolName,
  readThreadToolName,
  sendMessageToThreadToolName,
  archiveChildThreadsToolName,
]);

export interface ArchiveChildThreadsToolDetails {
  readonly action: typeof archiveChildThreadsAction;
  readonly archived: readonly string[];
  readonly skipped: readonly { readonly threadId: string; readonly reason: string }[];
  readonly error?: string;
}

export interface ListAgentsToolDetails {
  readonly action: typeof listAgentsAction;
  readonly workspaceId: string;
  readonly agents?: readonly AgentIdentityRecord[];
  readonly error?: string;
}

/**
 * The pi-subagents-shaped delegation result. The child is always a visible pi-gui thread;
 * a foreground call additionally carries the child's reply.
 */
export interface SubagentToolDetails {
  readonly action: typeof subagentAction;
  /** The agent identity the child ran as, or undefined for a default thread. */
  readonly agent?: string;
  readonly task?: string;
  readonly childThreadId?: string;
  readonly childWorkspaceId?: string;
  readonly childSessionId?: string;
  readonly title?: string;
  /** `running` for async delegation, otherwise the child's terminal state. */
  readonly status?: "running" | "completed" | "failed";
  /** The child's final assistant text, present only for a foreground call. */
  readonly reply?: string;
  readonly error?: string;
}

export interface CreateChildThreadToolDetails {
  readonly action: typeof createChildThreadAction;
  readonly prompt: string;
  /** Agent identity the child thread was asked to run as, when one was chosen. */
  readonly agent?: string;
  readonly childThreadId?: string;
  readonly childWorkspaceId?: string;
  readonly childSessionId?: string;
  readonly title?: string;
  readonly deliveryStatus?: "running" | "responded";
  readonly error?: string;
}

export interface OrchestrationThreadListEntry {
  readonly threadId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly status: string;
  /** `workspace` threads share the caller's project; `other_project` threads live in another one. */
  readonly relationship: "current" | "child" | "workspace" | "other_project";
  /** Display name of the thread's project, set only for `other_project` threads. */
  readonly project?: string;
  /** The thread's agent identity, when it started with one. */
  readonly agent?: string;
  readonly updatedAt: string;
  readonly preview: string;
  readonly childThreadId?: string;
  readonly supervisionGate?: "continue" | "wake" | "stop";
  readonly supervisionReason?: string;
  readonly nextSupervisionRunAt?: string;
}

export interface OrchestrationThreadTranscriptMessage {
  readonly id: string;
  readonly role: "parent" | "child" | "system";
  readonly text: string;
  readonly createdAt: string;
}

export interface ListThreadsToolDetails {
  readonly action: typeof listThreadsAction;
  /** The `workspace` argument, when the call named another project or `*`. */
  readonly workspace?: string;
  readonly threads?: readonly OrchestrationThreadListEntry[];
  /** Threads a `*` listing left out past its cap; name a project to see them. */
  readonly omittedThreadCount?: number;
  readonly error?: string;
}

export interface ReadThreadToolDetails {
  readonly action: typeof readThreadAction;
  readonly threadId: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly title?: string;
  readonly status?: string;
  readonly childThreadId?: string;
  readonly goal?: string;
  readonly messages?: readonly OrchestrationThreadTranscriptMessage[];
  readonly error?: string;
}

export interface SendMessageToThreadToolDetails {
  readonly action: typeof sendMessageToThreadAction;
  readonly threadId: string;
  readonly message: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly status?: "queued" | "sent";
  readonly queuedMessageCount?: number;
  /** Display name of the receiving project, set only when it is not the sender's project. */
  readonly project?: string;
  readonly error?: string;
}

export interface OrchestrationRuntimeBridge {
  readonly archiveChildThreads: (
    ctx: ExtensionContext,
    threadIds: readonly string[],
  ) => Promise<AgentToolResult<ArchiveChildThreadsToolDetails>>;
  readonly createChildThread: (
    ctx: ExtensionContext,
    input: { readonly prompt: string; readonly toolCallId: string; readonly agentName?: string },
  ) => Promise<AgentToolResult<CreateChildThreadToolDetails>>;
  readonly listAgents: (ctx: ExtensionContext) => Promise<AgentToolResult<ListAgentsToolDetails>>;
  readonly runSubagent: (
    ctx: ExtensionContext,
    input: {
      readonly agent?: string;
      readonly task: string;
      readonly foreground: boolean;
      readonly toolCallId: string;
    },
  ) => Promise<AgentToolResult<SubagentToolDetails>>;
  readonly listThreads: (
    ctx: ExtensionContext,
    input: { readonly workspace?: string },
  ) => Promise<AgentToolResult<ListThreadsToolDetails>>;
  readonly readThread: (
    ctx: ExtensionContext,
    threadId: string,
  ) => Promise<AgentToolResult<ReadThreadToolDetails>>;
  readonly sendMessageToThread: (
    ctx: ExtensionContext,
    input: { readonly threadId: string; readonly message: string },
  ) => Promise<AgentToolResult<SendMessageToThreadToolDetails>>;
}

type OrchestrationToolDetails =
  | ArchiveChildThreadsToolDetails
  | CreateChildThreadToolDetails
  | ListAgentsToolDetails
  | ListThreadsToolDetails
  | SubagentToolDetails
  | ReadThreadToolDetails
  | SendMessageToThreadToolDetails;

function createCreateChildThreadTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: createChildThreadToolName,
    label: "Create child thread",
    description:
      "Start a separate pi-gui child thread for a delegated investigation or implementation task, optionally as a named agent identity.",
    promptSnippet:
      "create_child_thread: start a separate pi-gui child thread for delegated work, optionally as an agent identity.",
    promptGuidelines: [
      "Use create_child_thread when the user asks you to spin up, delegate to, or run a separate child thread.",
      "Keep the child prompt concrete and self-contained so the user can inspect the resulting thread.",
      "Pass agent with a name returned by list_agents to run the child thread as that specialist; omit it for a default thread.",
    ],
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Concrete instructions for the child thread.",
        },
        agent: {
          type: "string",
          description:
            "Optional agent identity name from list_agents, such as scout, worker or reviewer.",
        },
      },
      required: ["prompt"],
    },
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const prompt = createChildThreadPromptFromParams(params);
      if (!prompt) {
        throw new Error("create_child_thread requires a non-empty prompt.");
      }
      const agentName = isRecord(params) ? stringParam(params, "agent") : undefined;
      return bridge.createChildThread(ctx, {
        prompt,
        toolCallId,
        ...(agentName ? { agentName } : {}),
      });
    },
  };
}

function createListAgentsTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: listAgentsToolName,
    label: "List agent identities",
    description:
      "List the agent identities available for new threads in this project, with what each is for.",
    promptSnippet:
      "list_agents: list the agent identities available for new threads in this project.",
    promptGuidelines: [
      "Use list_agents before create_child_thread when the child should run as a specific specialist.",
      "Pass a returned agent name to create_child_thread's agent parameter.",
    ],
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return bridge.listAgents(ctx);
    },
  };
}

/**
 * pi-gui's replacement for pi-subagents' `subagent` tool. It keeps the familiar
 * `agent`/`task` shape but never starts a hidden child session: every delegation is a
 * pi-gui thread the user can open, read and message.
 */
function createSubagentTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: subagentToolName,
    label: "Delegate to a subagent thread",
    description:
      'Delegate work to a focused child agent. The child always runs as a visible pi-gui thread the user can open, read and message; nothing runs hidden. Use action "list" to see the available agents.',
    promptSnippet:
      'subagent: delegate to a focused child agent as a visible pi-gui thread (also accepts action: "list").',
    promptGuidelines: [
      "Use subagent for delegation, delegation in the background, and parallel work; do not look for a separate hidden-child tool.",
      'Pass agent with a name from list_agents (or subagent action "list") to choose the specialist, and task with the concrete job.',
      "Async delegation (the default) returns a thread id immediately; set async: false to wait for the child and read its reply in this call.",
    ],
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list"],
          description: "List the available agent identities instead of delegating.",
        },
        agent: {
          type: "string",
          description:
            "Agent identity name, such as scout, worker or reviewer. Omit for a default thread.",
        },
        task: {
          type: "string",
          description: "The concrete job for the child agent.",
        },
        async: {
          type: "boolean",
          description: "Default true: return the thread id without waiting for the reply.",
        },
      },
    },
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const record = isRecord(params) ? params : {};
      if (record.action === "list") {
        return bridge.listAgents(ctx);
      }
      const task = typeof record.task === "string" ? record.task.trim() : "";
      if (!task) {
        return {
          content: [{ type: "text", text: "subagent requires a non-empty task." }],
          details: { action: subagentAction, error: "subagent requires a non-empty task." },
        };
      }
      const agent = stringParam(record, "agent");
      return bridge.runSubagent(ctx, {
        task,
        foreground: record.async === false,
        toolCallId,
        ...(agent ? { agent } : {}),
      });
    },
  };
}

function createListThreadsTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: listThreadsToolName,
    label: "List threads",
    description:
      "List pi-gui threads in the current project and parent thread, or in another project.",
    promptSnippet:
      "list_threads: list pi-gui threads for the current project, another project, or every project.",
    promptGuidelines: [
      "Use list_threads before reading or messaging another pi-gui thread when you need the exact thread id.",
      'Pass workspace with a project name, path or id to list that project\'s threads, or "*" for every project.',
      "Use the returned thread id with read_thread or send_message_to_thread.",
    ],
    parameters: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            'Optional project name, path or id to list instead of the current project, or "*" for every project.',
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workspace = isRecord(params) ? stringParam(params, "workspace") : undefined;
      return bridge.listThreads(ctx, workspace ? { workspace } : {});
    },
  };
}

function createReadThreadTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: readThreadToolName,
    label: "Read thread",
    description: "Read a pi-gui thread transcript or child thread summary by id.",
    promptSnippet: "read_thread: read a pi-gui thread transcript by id.",
    promptGuidelines: [
      "Use read_thread with a thread id returned by list_threads or create_child_thread.",
      "Prefer reading a child thread before summarizing its status back to the parent.",
    ],
    parameters: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "Thread id, child thread id, or session id to read.",
        },
      },
      required: ["thread_id"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const threadId = threadIdFromParams(params);
      if (!threadId) {
        return {
          content: [{ type: "text", text: "read_thread requires a thread_id." }],
          details: {
            action: readThreadAction,
            threadId: "",
            error: "read_thread requires a thread_id.",
          },
        };
      }
      return bridge.readThread(ctx, threadId);
    },
  };
}

function createSendMessageToThreadTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: sendMessageToThreadToolName,
    label: "Send message to thread",
    description:
      "Send a follow-up message to an existing pi-gui thread in this project or another project.",
    promptSnippet: "send_message_to_thread: send a follow-up to an existing pi-gui thread.",
    promptGuidelines: [
      "Use send_message_to_thread to follow up with an existing child, sibling, or other-project pi-gui thread.",
      "Use a thread id returned by list_threads or create_child_thread.",
    ],
    parameters: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "Thread id, child thread id, or session id to message.",
        },
        message: {
          type: "string",
          description: "Follow-up message to send.",
        },
      },
      required: ["thread_id", "message"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const threadId = threadIdFromParams(params);
      const message = messageFromParams(params);
      if (!threadId || !message) {
        return {
          content: [
            { type: "text", text: "send_message_to_thread requires thread_id and message." },
          ],
          details: {
            action: sendMessageToThreadAction,
            threadId: threadId ?? "",
            message: message ?? "",
            error: "send_message_to_thread requires thread_id and message.",
          },
        };
      }
      return bridge.sendMessageToThread(ctx, { threadId, message });
    },
  };
}

function createArchiveChildThreadsTool(
  bridge: OrchestrationRuntimeBridge,
): ToolDefinition<any, OrchestrationToolDetails> {
  return {
    name: archiveChildThreadsToolName,
    label: "Archive completed child threads",
    description:
      "Archive completed direct child threads of the current thread, preserving their history and drafts. Running, queued, incomplete and unrelated threads are skipped. Archived threads can be restored from the sidebar.",
    promptSnippet:
      "archive_child_threads: archive completed child threads only when the user requests it.",
    promptGuidelines: [
      "Only use archive_child_threads after the user explicitly asks to archive completed child threads; never archive proactively.",
      "Use list_threads and read_thread to identify your own children and confirm their requested work is finished. A stopped model turn alone does not prove the task is done.",
      "Pass exact thread ids and report the archived and skipped results. Never stop tasks or discard queued messages to make them eligible.",
    ],
    parameters: {
      type: "object",
      properties: {
        thread_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 100,
          description: "Exact completed direct child thread ids returned by list_threads.",
        },
      },
      required: ["thread_ids"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (
        !isRecord(params) ||
        !Array.isArray(params.thread_ids) ||
        params.thread_ids.length < 1 ||
        params.thread_ids.length > 100 ||
        !params.thread_ids.every(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      ) {
        return {
          content: [
            { type: "text", text: "archive_child_threads requires 1–100 exact thread_ids." },
          ],
          details: {
            action: archiveChildThreadsAction,
            archived: [],
            skipped: [],
            error: "Invalid thread_ids",
          },
        };
      }
      return bridge.archiveChildThreads(
        ctx,
        params.thread_ids.map((id: string) => id.trim()),
      );
    },
  };
}

export function createOrchestrationRuntimeTools(
  bridge: OrchestrationRuntimeBridge,
): readonly ToolDefinition<any, OrchestrationToolDetails>[] {
  return [
    createSubagentTool(bridge),
    createCreateChildThreadTool(bridge),
    createListAgentsTool(bridge),
    createListThreadsTool(bridge),
    createReadThreadTool(bridge),
    createSendMessageToThreadTool(bridge),
    createArchiveChildThreadsTool(bridge),
  ];
}

export function createOrchestrationRuntimeExtension(
  bridge: OrchestrationRuntimeBridge,
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    for (const tool of createOrchestrationRuntimeTools(bridge)) {
      pi.registerTool(tool);
    }
  };
}

export function createChildThreadPromptFromParams(params: unknown): string | undefined {
  if (!isRecord(params)) {
    return undefined;
  }
  const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  return prompt || undefined;
}

export function createChildThreadPromptFromToolOutput(output: unknown): string | undefined {
  if (!isRecord(output) || !isRecord(output.details)) {
    return undefined;
  }
  if (output.details.action !== createChildThreadAction) {
    return undefined;
  }
  return createChildThreadPromptFromParams(output.details);
}

/** The agent identity a finished create_child_thread call asked for, when it named one. */
export function createChildThreadAgentFromToolOutput(output: unknown): string | undefined {
  const details = toolOutputDetails(output);
  if (details?.action !== createChildThreadAction) {
    return undefined;
  }
  return stringParam(details, "agent");
}

export function listThreadsRequestedFromToolOutput(output: unknown): boolean {
  return toolOutputDetails(output)?.action === listThreadsAction;
}

export function readThreadIdFromToolOutput(output: unknown): string | undefined {
  const details = toolOutputDetails(output);
  if (details?.action !== readThreadAction) {
    return undefined;
  }
  return threadIdFromParams(details);
}

export function sendMessageToThreadFromToolOutput(
  output: unknown,
): { readonly threadId: string; readonly message: string } | undefined {
  const details = toolOutputDetails(output);
  if (details?.action !== sendMessageToThreadAction) {
    return undefined;
  }
  const threadId = threadIdFromParams(details);
  const message = messageFromParams(details);
  if (!threadId || !message) {
    return undefined;
  }
  return { threadId, message };
}

function toolOutputDetails(output: unknown): Record<string, unknown> | undefined {
  if (!isRecord(output) || !isRecord(output.details)) {
    return undefined;
  }
  return output.details;
}

function threadIdFromParams(params: unknown): string | undefined {
  if (!isRecord(params)) {
    return undefined;
  }
  const threadId =
    stringParam(params, "thread_id") ??
    stringParam(params, "threadId") ??
    stringParam(params, "id");
  return threadId || undefined;
}

function messageFromParams(params: unknown): string | undefined {
  if (!isRecord(params)) {
    return undefined;
  }
  const message = stringParam(params, "message") ?? stringParam(params, "text");
  return message || undefined;
}

function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
