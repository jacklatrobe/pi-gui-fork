import { randomBytes } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Suffix of the transient files writeFileAtomic creates before renaming into place. */
export const TMP_SUFFIX = ".tmp";

/**
 * Windows replaces an existing file with MoveFileEx, which can transiently fail
 * with EPERM/EACCES/EBUSY when a concurrent writer or antivirus holds the target.
 * A short bounded retry keeps the rename atomic (the temp file is only ever
 * renamed, never unlinked-then-written) while riding out that contention.
 * POSIX rename never returns these codes, so behavior there is unchanged.
 */
const TRANSIENT_RENAME_ERROR_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
export const RENAME_MAX_ATTEMPTS = 12;
const RENAME_BACKOFF_MS = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export type RenameFn = (oldPath: string, newPath: string) => Promise<void>;

/**
 * Rename `tmpPath` over `filePath`, retrying only transient filesystem errors.
 * `renameFn` and `sleepFn` are injectable so the retry policy is unit-testable
 * on every platform, including the POSIX lanes that never hit the error.
 */
export async function renameIntoPlace(
  tmpPath: string,
  filePath: string,
  renameFn: RenameFn = rename,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await renameFn(tmpPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (attempt >= RENAME_MAX_ATTEMPTS || !code || !TRANSIENT_RENAME_ERROR_CODES.has(code)) {
        throw error;
      }
      await sleepFn(RENAME_BACKOFF_MS * attempt);
    }
  }
}

let tmpCounter = 0;

/**
 * Write `data` to `filePath` durably. A concurrent reader or a crash at any
 * point always observes either the previous file contents or the fully-written
 * new contents — never a missing, truncated, or partially-written file.
 *
 * Steps:
 * - Write to a uniquely-named temp file in the same directory and fsync it.
 * - rename() straight over the target (atomic replace on POSIX). There is no
 *   unlink first, so a crash in the write window cannot leave the target gone.
 * - fsync the containing directory so the rename entry itself survives power
 *   loss, not just the temp file's data blocks.
 */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  // Collision-safe temp name: a pid + monotonic counter + randomness so two
  // writers, or two writes within the same millisecond, never share a path
  // (Date.now() alone is not unique under concurrent writes).
  tmpCounter = (tmpCounter + 1) >>> 0;
  const tmpPath = `${filePath}.${process.pid}.${tmpCounter}.${randomBytes(6).toString("hex")}${TMP_SUFFIX}`;

  const handle = await open(tmpPath, "w");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await renameIntoPlace(tmpPath, filePath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }

  await syncDirectory(dir);
}

/** Serialize `value` as pretty JSON with a trailing newline and write it atomically. */
export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function syncDirectory(dir: string): Promise<void> {
  let handle;
  try {
    handle = await open(dir, "r");
  } catch {
    // Some platforms (notably Windows) reject opening a directory for fsync.
    // The rename above is still atomic; skip the extra durability step.
    return;
  }
  try {
    await handle.sync();
  } catch {
    // Best effort — a failed directory fsync must not fail the write.
  } finally {
    await handle.close();
  }
}
