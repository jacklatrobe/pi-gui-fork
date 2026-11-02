import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { dropSupersededDelegationExtensions } from "../dist/superseded-extensions.js";

function extensionSource(toolName: string): string {
  return [
    "export default function (pi) {",
    "  pi.registerTool({",
    `    name: "${toolName}",`,
    `    label: "${toolName}",`,
    `    description: "${toolName}",`,
    "    parameters: { type: 'object', properties: {} },",
    "    execute: () => Promise.resolve({ content: [], details: undefined }),",
    "  });",
    "}",
    "",
  ].join("\n");
}

async function createDirs() {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-superseded-"));
  const agentDir = join(root, "agent");
  const workspacePath = join(root, "workspace");
  await mkdir(agentDir, { recursive: true });
  await mkdir(workspacePath, { recursive: true });
  await writeFile(join(agentDir, "auth.json"), "{}");
  await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: [] }));
  return { agentDir, workspacePath };
}

async function writeExtension(path: string, toolName: string): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, extensionSource(toolName), "utf8");
  return path;
}

await test("the pi-subagents package extension is not loaded beside pi-gui's subagent tool", async () => {
  const { agentDir, workspacePath } = await createDirs();
  const subagentsPath = await writeExtension(
    join(agentDir, "npm", "node_modules", "pi-subagents", "index.ts"),
    "subagent",
  );
  const otherPath = await writeExtension(join(agentDir, "extensions", "other.ts"), "other_tool");

  const loader = new DefaultResourceLoader({
    cwd: workspacePath,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
    extensionsOverride: dropSupersededDelegationExtensions,
    additionalExtensionPaths: [subagentsPath, otherPath],
  });
  await loader.reload();

  const extensionPaths = loader
    .getExtensions()
    .extensions.map((extension) => extension.resolvedPath || extension.path);
  assert.ok(
    extensionPaths.some((path) => path.includes("other")),
    `expected the unrelated extension to load: ${extensionPaths.join(", ")}`,
  );
  assert.ok(
    !extensionPaths.some((path) => path.includes("node_modules/pi-subagents")),
    `expected pi-subagents not to load: ${extensionPaths.join(", ")}`,
  );
});
