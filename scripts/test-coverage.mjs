#!/usr/bin/env node
// Run every Node-based (node:test) lane under Node's built-in coverage, then
// merge the lcov output and enforce the floor. Renderer/main coverage is owned
// by the Electron core lane and is intentionally out of scope here.
//
// Usage: node scripts/test-coverage.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkCoverage,
  formatSummary,
  mergeCoverage,
  parseLcov,
  parseThresholds,
  summarizeCoverage,
} from "./check-coverage.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const coverageDir = path.join(root, "coverage");
mkdirSync(coverageDir, { recursive: true });

// `pnpm test:coverage` builds the shared packages first, so each lane only runs
// its already-built dist through node:test with coverage enabled.
const lanes = [
  { name: "catalogs", cwd: "packages/catalogs" },
  { name: "pi-sdk-driver", cwd: "packages/pi-sdk-driver" },
  { name: "extension-ui", cwd: "packages/extension-ui" },
];

let laneFailed = false;

for (const lane of lanes) {
  const cwd = path.join(root, lane.cwd);
  const destination = path.join(coverageDir, `${lane.name}.info`);
  const run = spawnSync(
    process.execPath,
    [
      "--test",
      "--experimental-test-coverage",
      "--test-coverage-exclude=**/test/**",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=lcov",
      `--test-reporter-destination=${destination}`,
      "test/**/*.test.mts",
    ],
    { cwd, stdio: "inherit" },
  );
  if (run.status !== 0) {
    console.error(`Coverage lane ${lane.name}: tests failed.`);
    laneFailed = true;
  }
}

const reports = [];
for (const lane of lanes) {
  try {
    reports.push(parseLcov(await readFile(path.join(coverageDir, `${lane.name}.info`), "utf8")));
  } catch {
    // A lane that failed before producing coverage is surfaced by laneFailed.
  }
}

const summary = summarizeCoverage(mergeCoverage(reports));
const report = formatSummary(summary);
console.log(report);
const thresholdFlag = process.argv.indexOf("--thresholds");
const thresholds = parseThresholds(
  thresholdFlag === -1 ? undefined : process.argv[thresholdFlag + 1],
);
const failures = checkCoverage(summary, thresholds);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}
if (failures.length) console.error(failures.join("\n"));
process.exitCode = laneFailed || failures.length > 0 ? 1 : 0;
