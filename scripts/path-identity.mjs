// Cross-platform path identity for guards and guard tests.
//
// Windows makes "the same file" hard to compare: realpath may return an
// extended-length `\\?\C:\...` path, the OS resolves 8.3 short names
// (`RUNNER~1` -> `runneradmin`), the drive letter case can differ, and
// separators are backslashes. Guards must not report phantom workspaces just
// because two spellings of one directory were compared as strings.

import { realpathSync } from "node:fs";

// The native realpath resolves Windows 8.3 short names (RUNNER~1 -> runneradmin);
// the JS fallback can return the short spelling, which would make two names for
// one directory compare unequal. Native is available on Windows and macOS.
const realpath = realpathSync.native ?? realpathSync;

const stripWindowsPrefix = (value) =>
  value.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
const trimTrailingSeparator = (value) => value.replace(/[/\\]+$/, "");

/** Render any path with POSIX separators for stable messages. */
export const toPosix = (value) => value.split(/[\\/]+/).join("/");

/**
 * Resolve a path to its real location, tolerating missing paths and stripping
 * the Windows extended-length prefix so both spellings compare equal.
 */
export function resolvedPath(value) {
  let resolved = stripWindowsPrefix(String(value));
  try {
    resolved = stripWindowsPrefix(realpath(resolved));
  } catch {
    // Missing paths (fixtures mid-creation) compare as given.
  }
  return resolved;
}

/** Canonical comparison key. Case-folded only where the filesystem is. */
export function canonicalPath(value) {
  const normalized = toPosix(trimTrailingSeparator(resolvedPath(value)));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** True when both paths name the same location on this platform. */
export function samePath(a, b) {
  return canonicalPath(a) === canonicalPath(b);
}
