import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { SessionRef } from "@pi-gui/session-driver";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  runOrchestrationRuntimeTool,
  seedAgentDir,
} from "../helpers/electron-app";
import { startHangingOpenAiServer } from "../helpers/hanging-openai-server";

async function selectedSessionRef(
  window: Parameters<typeof getDesktopState>[0],
): Promise<SessionRef> {
  const state = await getDesktopState(window);
  if (!state.selectedWorkspaceId || !state.selectedSessionId) {
    throw new Error("Expected a selected session");
  }
  return { workspaceId: state.selectedWorkspaceId, sessionId: state.selectedSessionId };
}

function agentFile(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "tools: read, grep, ls",
    "---",
    "",
    `You are the ${name} agent.`,
  ].join("\n");
}

test("agent identities drive the New thread picker and every child thread", async () => {
  test.setTimeout(120_000);
  const server = await startHangingOpenAiServer();
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("agent-identities");
  await seedAgentDir(agentDir, {
    withOpenAiAuth: false,
    withDefaultModel: false,
    enabledModels: ["slow-test/slow"],
  });
  await mkdir(join(agentDir, "agents"), { recursive: true });
  await writeFile(join(agentDir, "agents", "scout.md"), agentFile("scout", "Fast recon"), "utf8");
  await writeFile(join(agentDir, "agents", "worker.md"), agentFile("worker", "Implement"), "utf8");
  await writeFile(
    join(agentDir, "settings.json"),
    `${JSON.stringify(
      { defaultProvider: "slow-test", defaultModel: "slow", enabledModels: ["slow-test/slow"] },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(agentDir, "models.json"),
    `${JSON.stringify(
      {
        providers: {
          "slow-test": {
            baseUrl: server.baseUrl,
            api: "openai-completions",
            apiKey: "unused",
            models: [{ id: "slow" }],
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    scrubProviderEnv: true,
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();

    // The human path: choose an identity in New thread and start the thread as it.
    await openNewThread(window);
    await window.getByTestId("agent-identity-badge").click();
    await expect(window.getByTestId("agent-identity-option-scout")).toBeVisible();
    await window.getByTestId("agent-identity-option-scout").click();
    await expect(window.getByTestId("agent-identity-badge")).toHaveText("Agent · scout");
    await window.getByLabel("New thread prompt").fill("Scout the checkout.");
    await window.getByRole("button", { name: "Start thread" }).click();
    await expect(window.getByTestId("composer")).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("agent-identity-session-badge")).toHaveText("Agent · scout");

    const scoutRef = await selectedSessionRef(window);
    const scoutRecord = async () =>
      (await getDesktopState(window)).workspaces
        .flatMap((workspace) => workspace.sessions)
        .find((session) => session.id === scoutRef.sessionId);
    await expect.poll(async () => (await scoutRecord())?.agentName).toBe("scout");

    // The agent path: the same identities, chosen by tools.
    const agents = await runOrchestrationRuntimeTool(harness, {
      toolName: "list_agents",
      toolCallId: "list-agents",
      sessionRef: scoutRef,
      params: {},
    });
    expect((agents.details?.agents as { name: string }[] | undefined)?.map((a) => a.name)).toEqual([
      "scout",
      "worker",
    ]);

    const created = await runOrchestrationRuntimeTool(harness, {
      toolName: "create_child_thread",
      toolCallId: "create-child-as-scout",
      sessionRef: scoutRef,
      params: { prompt: "Keep working while the model is slow.", agent: "scout" },
    });
    expect(created.details).toMatchObject({ agent: "scout", deliveryStatus: "running" });
    const childState = await getDesktopState(window);
    const child = childState.orchestrationChildren.find(
      (entry) => entry.sourceToolCallId === "create-child-as-scout",
    );
    expect(child?.status).toBe("running");
    const childRecord = childState.workspaces
      .flatMap((workspace) => workspace.sessions)
      .find((session) => session.id === child?.childSessionId);
    expect(childRecord?.agentName).toBe("scout");
    await expect(
      window.locator(
        `.session-row[data-session-id="${child?.childSessionId}"] .session-row__agent`,
      ),
    ).toHaveText("scout");

    // pi-gui's subagent tool is the delegation surface: same shape, always a thread.
    const delegated = await runOrchestrationRuntimeTool(harness, {
      toolName: "subagent",
      toolCallId: "subagent-worker",
      sessionRef: scoutRef,
      params: { agent: "worker", task: "Implement the delegated change." },
    });
    expect(delegated.details).toMatchObject({ action: "pi_gui_subagent", agent: "worker" });
    expect(delegated.details?.status).toBe("running");
    const delegatedChild = (await getDesktopState(window)).orchestrationChildren.find(
      (entry) => entry.sourceToolCallId === "subagent-worker",
    );
    expect(delegatedChild?.childSessionId).toBeTruthy();

    const threads = await runOrchestrationRuntimeTool(harness, {
      toolName: "list_threads",
      toolCallId: "list-threads-agents",
      sessionRef: scoutRef,
      params: {},
    });
    const listed = threads.details?.threads as { agent?: string }[] | undefined;
    expect(listed?.some((thread) => thread.agent === "worker")).toBe(true);
  } finally {
    await harness.close();
    await server.close();
  }
});
