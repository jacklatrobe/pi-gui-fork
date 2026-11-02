import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  discoverAgentIdentities,
  listAgentIdentities,
  resolveAgentIdentity,
} from "../../electron/agents/agent-identity-catalog";

async function makeDirs() {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-agents-"));
  const agentDir = join(root, "agent");
  const workspacePath = join(root, "workspace");
  await Promise.all([
    mkdir(join(agentDir, "agents"), { recursive: true }),
    mkdir(join(workspacePath, ".pi", "agents"), { recursive: true }),
  ]);
  return { root, agentDir, workspacePath };
}

async function writeAgent(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

const SCOUT = [
  "---",
  "name: scout",
  "description: Fast codebase recon",
  "tools: read, grep, ls",
  "---",
  "",
  "You scout the codebase.",
].join("\n");

test("reads agent markdown from user and project directories", async () => {
  const { agentDir, workspacePath } = await makeDirs();
  await writeAgent(join(agentDir, "agents", "scout.md"), SCOUT);
  await writeAgent(
    join(workspacePath, ".pi", "agents", "worker.md"),
    ["---", "name: worker", "description: Implementation work", "---", "You implement."].join("\n"),
  );

  const agents = await listAgentIdentities({ agentDir, workspacePath });
  expect(agents.map((agent) => agent.name).sort()).toEqual(["scout", "worker"]);
  const scout = await resolveAgentIdentity({ agentDir, workspacePath }, "scout");
  expect(scout?.systemPrompt).toBe("You scout the codebase.");
  expect(scout?.tools).toEqual(["read", "grep", "ls"]);
  expect(scout?.source).toBe("user");
});

test("a project agent replaces a user agent with the same name", async () => {
  const { agentDir, workspacePath } = await makeDirs();
  await writeAgent(join(agentDir, "agents", "scout.md"), SCOUT);
  await writeAgent(
    join(workspacePath, ".pi", "agents", "scout.md"),
    ["---", "name: scout", "description: Project scout", "---", "Project prompt."].join("\n"),
  );

  const scout = await resolveAgentIdentity({ agentDir, workspacePath }, "scout");
  expect(scout?.description).toBe("Project scout");
  expect(scout?.source).toBe("project");
});

test("settings overrides and disabled agents are applied to discovered agents", async () => {
  const { agentDir, workspacePath } = await makeDirs();
  await writeAgent(join(agentDir, "agents", "scout.md"), SCOUT);
  await writeAgent(join(agentDir, "agents", "reviewer.md"), SCOUT.replace("scout", "reviewer"));

  const agents = await listAgentIdentities({
    agentDir,
    workspacePath,
    settings: [
      { subagents: { agentOverrides: { scout: { description: "Deployment scout" } } } },
      { subagents: { agentOverrides: { reviewer: { disabled: true } } } },
    ],
  });
  expect(agents.map((agent) => agent.name)).toEqual(["scout"]);
  expect(agents[0]?.description).toBe("Deployment scout");
});

test("frontmatter model and thinking become launch fields", async () => {
  const { agentDir, workspacePath } = await makeDirs();
  await writeAgent(
    join(agentDir, "agents", "oracle.md"),
    [
      "---",
      "name: oracle",
      "description: Second opinion",
      "model: anthropic/claude-opus-4-6",
      "thinking: high",
      "---",
      "Challenge assumptions.",
    ].join("\n"),
  );

  const definition = await resolveAgentIdentity({ agentDir, workspacePath }, "oracle");
  expect(definition?.provider).toBe("anthropic");
  expect(definition?.modelId).toBe("claude-opus-4-6");
  expect(definition?.thinkingLevel).toBe("high");
  const [record] = await listAgentIdentities({ agentDir, workspacePath });
  expect(record?.model).toBe("anthropic/claude-opus-4-6");
});

test("chain files, missing frontmatter names and unknown directories are skipped", async () => {
  const { agentDir, workspacePath } = await makeDirs();
  await writeAgent(join(agentDir, "agents", "pipeline.chain.md"), SCOUT);
  await writeAgent(join(agentDir, "agents", "nameless.md"), "no frontmatter here");
  const definitions = await discoverAgentIdentities({
    agentDir: join(agentDir, "does-not-exist"),
    workspacePath: join(workspacePath, "does-not-exist"),
  });
  expect(definitions).toEqual([]);

  const agents = await listAgentIdentities({ agentDir, workspacePath });
  expect(agents).toEqual([{ name: "nameless", description: "", source: "user" }]);
});
