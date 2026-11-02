import type { PiResourceLoaderOptions } from "./npm-package-fallback.js";

type LoadedExtensions = Parameters<NonNullable<PiResourceLoaderOptions["extensionsOverride"]>>[0];

/**
 * pi-gui owns delegation: a subagent is always a visible pi-gui thread. pi-subagents'
 * extension would register a competing `subagent` tool that runs hidden child sessions, so
 * it is not loaded into pi-gui sessions; its agent markdown files still define identities.
 */
export function dropSupersededDelegationExtensions(base: LoadedExtensions): LoadedExtensions {
  const kept = base.extensions.filter((extension) => !isSupersededDelegationExtension(extension));
  return kept.length === base.extensions.length ? base : { ...base, extensions: kept };
}

function isSupersededDelegationExtension(extension: {
  readonly path: string;
  readonly resolvedPath?: string;
}): boolean {
  const path = (extension.resolvedPath || extension.path).replace(/\\/g, "/");
  return (
    /(^|\/)node_modules\/pi-subagents(\/|$)/.test(path) ||
    /(^|\/)extensions\/subagent(\/|$)/.test(path)
  );
}
