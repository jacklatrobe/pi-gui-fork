import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalPath, samePath, toPosix } from "./path-identity.mjs";

test("toPosix renders backslash and forward-slash paths identically", () => {
  assert.equal(toPosix("packages\\catalogs\\src"), "packages/catalogs/src");
  assert.equal(toPosix("packages/catalogs/src"), "packages/catalogs/src");
});

test("samePath resolves a real directory through a different spelling", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-gui-path-id-"));
  mkdirSync(path.join(root, "nested"));
  writeFileSync(path.join(root, "nested", "file.txt"), "x");
  const direct = path.join(root, "nested");
  const withSuffix = `${direct}${path.sep}`;
  assert.equal(samePath(direct, withSuffix), true);
  assert.equal(samePath(direct, path.join(root, "other")), false);
});

test("canonicalPath strips a trailing separator but keeps distinct paths distinct", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-gui-path-id-"));
  assert.equal(canonicalPath(root), canonicalPath(`${root}${path.sep}`));
  assert.notEqual(canonicalPath(root), canonicalPath(path.join(root, "child")));
});

test("a Windows extended-length prefix does not create a phantom difference", () => {
  if (process.platform !== "win32") return;
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-gui-path-id-"));
  assert.equal(samePath(root, `\\\\?\\${root}`), true);
});
