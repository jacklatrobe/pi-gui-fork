import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentIdentityRecord, AgentIdentitySource } from "../../contracts/agents";

/**
 * An agent identity is a pi-subagents-style markdown agent: YAML frontmatter that names
 * the specialist and its tools, and a body that becomes its system prompt. pi-gui reads
 * the same files pi-subagents does so a thread can run as one of them; pi-gui does not
 * load pi-subagents itself.
 */
export type { AgentIdentityRecord, AgentIdentitySource };

export interface AgentIdentityDefinition {
  readonly name: string;
  readonly description: string;
  readonly source: AgentIdentitySource;
  /** The markdown body, appended to the thread's system prompt. */
  readonly systemPrompt?: string;
  /** Tool allowlist from the frontmatter; omitted keeps pi's default tools. */
  readonly tools?: readonly string[];
  readonly provider?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: string;
}

interface DiscoveryRoot {
  readonly source: AgentIdentitySource;
  readonly path: string;
}

/**
 * Roots in ascending precedence: a later root's same-named agent replaces an earlier one,
 * so project agents beat user agents, which beat the pi-subagents package and builtins.
 */
function discoveryRoots(agentDir: string, workspacePath: string): readonly DiscoveryRoot[] {
  return [
    { source: "builtin", path: join(agentDir, "extensions", "subagent", "agents") },
    { source: "package", path: join(agentDir, "npm", "node_modules", "pi-subagents", "agents") },
    { source: "user", path: join(agentDir, "agents") },
    { source: "project", path: join(workspacePath, ".agents") },
    { source: "project", path: join(workspacePath, ".pi", "agents") },
  ];
}

export function toAgentIdentityRecord(definition: AgentIdentityDefinition): AgentIdentityRecord {
  return {
    name: definition.name,
    description: definition.description,
    source: definition.source,
    ...(definition.tools && definition.tools.length > 0 ? { tools: [...definition.tools] } : {}),
    ...(definition.modelId
      ? {
          model: definition.provider
            ? `${definition.provider}/${definition.modelId}`
            : definition.modelId,
        }
      : {}),
    ...(definition.thinkingLevel ? { thinking: definition.thinkingLevel } : {}),
  };
}

/**
 * Every agent identity a workspace can start a thread as, low priority first so callers
 * can see the shadowed definitions too. Settings overrides are applied last.
 */
export async function discoverAgentIdentities(options: {
  readonly agentDir: string;
  readonly workspacePath: string;
  /** Settings objects in ascending precedence: global first, then project. */
  readonly settings?: readonly Record<string, unknown>[];
}): Promise<AgentIdentityDefinition[]> {
  const ordered: AgentIdentityDefinition[] = [];
  const byName = new Map<string, number>();
  for (const root of discoveryRoots(options.agentDir, options.workspacePath)) {
    for (const definition of await readAgentDirectory(root)) {
      const existing = byName.get(definition.name);
      if (existing === undefined) {
        byName.set(definition.name, ordered.length);
        ordered.push(definition);
      } else {
        // A higher-priority root replaces the definition in place, keeping name order stable.
        ordered[existing] = definition;
      }
    }
  }

  const overridden = applyAgentOverrides(ordered, options.settings ?? []);
  return overridden;
}

/** The catalog the renderer and agent tools use, with disabled agents hidden. */
export async function listAgentIdentities(options: {
  readonly agentDir: string;
  readonly workspacePath: string;
  readonly settings?: readonly Record<string, unknown>[];
}): Promise<AgentIdentityRecord[]> {
  const definitions = await discoverAgentIdentities(options);
  return definitions.map(toAgentIdentityRecord).sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve one identity by name for a session; unknown names return undefined. */
export async function resolveAgentIdentity(
  options: {
    readonly agentDir: string;
    readonly workspacePath: string;
    readonly settings?: readonly Record<string, unknown>[];
  },
  name: string,
): Promise<AgentIdentityDefinition | undefined> {
  const wanted = name.trim();
  if (!wanted) return undefined;
  const definitions = await discoverAgentIdentities(options);
  return definitions.find((definition) => definition.name === wanted);
}

async function readAgentDirectory(root: DiscoveryRoot): Promise<AgentIdentityDefinition[]> {
  const files = await markdownFilesUnder(root.path);
  const definitions: AgentIdentityDefinition[] = [];
  for (const file of files) {
    if (file.endsWith(".chain.md")) continue;
    const definition = await readAgentFile(root.source, file);
    if (definition) definitions.push(definition);
  }
  return definitions;
}

async function markdownFilesUnder(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFilesUnder(path)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

async function readAgentFile(
  source: AgentIdentitySource,
  path: string,
): Promise<AgentIdentityDefinition | undefined> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  const parsed = parseAgentMarkdown(content);
  if (!parsed) return undefined;
  const name =
    nonEmptyString(parsed.frontmatter.name) ?? basename(path).replace(/\.md$/i, "").trim();
  if (!name) return undefined;
  const model = nonEmptyString(parsed.frontmatter.model);
  const tools = parseToolList(parsed.frontmatter.tools);
  const body = parsed.body.trim();
  const split = splitModel(model);
  return {
    name,
    description: nonEmptyString(parsed.frontmatter.description) ?? "",
    source,
    ...(body ? { systemPrompt: body } : {}),
    ...(tools ? { tools } : {}),
    ...(split.provider ? { provider: split.provider } : {}),
    ...(split.modelId ? { modelId: split.modelId } : {}),
    ...(nonEmptyString(parsed.frontmatter.thinking)
      ? { thinkingLevel: nonEmptyString(parsed.frontmatter.thinking)! }
      : {}),
  };
}

function parseAgentMarkdown(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | undefined {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: normalized };
  }
  const rawFrontmatter = normalized.slice(3, end).trim();
  const body = normalized.slice(end + 4);
  let frontmatter: unknown;
  try {
    frontmatter = rawFrontmatter ? parseYaml(rawFrontmatter) : {};
  } catch {
    return undefined;
  }
  return {
    frontmatter: isRecord(frontmatter) ? frontmatter : {},
    body,
  };
}

function applyAgentOverrides(
  definitions: readonly AgentIdentityDefinition[],
  settings: readonly Record<string, unknown>[],
): AgentIdentityDefinition[] {
  let next = [...definitions];
  for (const setting of settings) {
    const subagents = isRecord(setting.subagents) ? setting.subagents : undefined;
    const overrides =
      subagents && isRecord(subagents.agentOverrides) ? subagents.agentOverrides : undefined;
    if (!overrides) continue;
    next = next.flatMap((definition) => {
      const override = overrides[definition.name];
      if (!isRecord(override)) return [definition];
      if (override.disabled === true) return [];
      const model = nonEmptyString(override.model);
      const tools = parseToolList(override.tools);
      const overridden: AgentIdentityDefinition = {
        ...definition,
        ...(nonEmptyString(override.description) !== undefined
          ? { description: nonEmptyString(override.description)! }
          : {}),
        ...(tools ? { tools } : {}),
        ...(model !== undefined ? splitModelInto(model) : {}),
        ...(nonEmptyString(override.thinking) !== undefined
          ? { thinkingLevel: nonEmptyString(override.thinking)! }
          : {}),
        ...(typeof override.systemPrompt === "string" && override.systemPrompt.trim()
          ? { systemPrompt: override.systemPrompt.trim() }
          : {}),
      };
      return [overridden];
    });
  }
  return next;
}

function splitModelInto(model: string): { provider?: string; modelId?: string } {
  return splitModel(model);
}

function splitModel(model: string | undefined): { provider?: string; modelId?: string } {
  if (!model || model === "inherit") return {};
  const separator = model.indexOf("/");
  if (separator <= 0 || separator === model.length - 1) {
    return { modelId: model };
  }
  return { provider: model.slice(0, separator), modelId: model.slice(separator + 1) };
}

function parseToolList(value: unknown): string[] | undefined {
  const names = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? value.split(",")
      : undefined;
  if (!names) return undefined;
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
