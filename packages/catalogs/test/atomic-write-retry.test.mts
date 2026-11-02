import test from "node:test";
import assert from "node:assert/strict";
import { renameIntoPlace, RENAME_MAX_ATTEMPTS } from "../dist/node/atomic-write.js";

const noSleep = async () => {};

function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: simulated rename failure`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

await test("retries a transient rename failure until it succeeds", async () => {
  let attempts = 0;
  await renameIntoPlace(
    "tmp",
    "target",
    async () => {
      attempts += 1;
      if (attempts < 3) throw errnoError("EPERM");
    },
    noSleep,
  );
  assert.equal(attempts, 3);
});

await test("retries every transient code Windows can return", async () => {
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    let attempts = 0;
    await renameIntoPlace(
      "tmp",
      "target",
      async () => {
        attempts += 1;
        if (attempts === 1) throw errnoError(code);
      },
      noSleep,
    );
    assert.equal(attempts, 2, code);
  }
});

await test("does not retry a non-transient filesystem error", async () => {
  let attempts = 0;
  await assert.rejects(
    renameIntoPlace(
      "tmp",
      "target",
      async () => {
        attempts += 1;
        throw errnoError("ENOENT");
      },
      noSleep,
    ),
    /ENOENT/,
  );
  assert.equal(attempts, 1);
});

await test("gives up after the bounded attempt budget on persistent contention", async () => {
  let attempts = 0;
  await assert.rejects(
    renameIntoPlace(
      "tmp",
      "target",
      async () => {
        attempts += 1;
        throw errnoError("EPERM");
      },
      noSleep,
    ),
    /EPERM/,
  );
  assert.equal(attempts, RENAME_MAX_ATTEMPTS);
});
