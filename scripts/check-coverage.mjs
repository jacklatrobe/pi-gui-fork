// Merge Node's built-in lcov output from every Node-based test lane and enforce
// a coverage floor. Dependency-free so it runs in CI before any build step.
//
// Node's `--experimental-test-coverage --test-reporter=lcov` emits standard
// lcov records: DA (lines), BRDA (branches), FNDA (functions). We union hits
// per file+line so a file exercised by two lanes is not double counted.

import { readFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** @typedef {{ lines: Map<number, number>, branches: Map<string, number>, functions: Map<string, number> }} FileCoverage */

const toPosix = (value) => value.replace(/\\/g, "/");

/**
 * Parse one lcov document into per-file coverage.
 * @param {string} text
 * @returns {Map<string, FileCoverage>}
 */
export function parseLcov(text) {
  /** @type {Map<string, FileCoverage>} */
  const files = new Map();
  let current;
  const file = (name) => {
    let entry = files.get(name);
    if (!entry) {
      entry = { lines: new Map(), branches: new Map(), functions: new Map() };
      files.set(name, entry);
    }
    return entry;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      current = file(toPosix(line.slice(3)));
      continue;
    }
    if (!current) continue;
    if (line.startsWith("DA:")) {
      const [lineNo, count] = line.slice(3).split(",");
      const key = Number(lineNo);
      current.lines.set(key, Math.max(current.lines.get(key) ?? 0, Number(count) || 0));
    } else if (line.startsWith("BRDA:")) {
      const [branchLine, block, branch, taken] = line.slice(5).split(",");
      const key = `${branchLine}|${block}|${branch}`;
      const hits = taken === "-" ? 0 : Number(taken) || 0;
      current.branches.set(key, Math.max(current.branches.get(key) ?? 0, hits));
    } else if (line.startsWith("FNDA:")) {
      const comma = line.indexOf(",");
      const count = Number(line.slice(5, comma)) || 0;
      const name = line.slice(comma + 1);
      current.functions.set(name, Math.max(current.functions.get(name) ?? 0, count));
    }
  }
  return files;
}

/**
 * @param {Map<string, FileCoverage>[]} documents
 * @returns {Map<string, FileCoverage>}
 */
export function mergeCoverage(documents) {
  /** @type {Map<string, FileCoverage>} */
  const merged = new Map();
  for (const document of documents) {
    for (const [name, coverage] of document) {
      let entry = merged.get(name);
      if (!entry) {
        entry = { lines: new Map(), branches: new Map(), functions: new Map() };
        merged.set(name, entry);
      }
      for (const [key, value] of coverage.lines)
        entry.lines.set(key, Math.max(entry.lines.get(key) ?? 0, value));
      for (const [key, value] of coverage.branches)
        entry.branches.set(key, Math.max(entry.branches.get(key) ?? 0, value));
      for (const [key, value] of coverage.functions)
        entry.functions.set(key, Math.max(entry.functions.get(key) ?? 0, value));
    }
  }
  return merged;
}

const percent = (hit, total) => (total === 0 ? 100 : (hit / total) * 100);
const round = (value) => Math.round(value * 100) / 100;

/**
 * Aggregate merged coverage into totals and percentages.
 * @param {Map<string, FileCoverage>} merged
 */
export function summarizeCoverage(merged) {
  let lines = 0,
    linesHit = 0,
    branches = 0,
    branchesHit = 0,
    functions = 0,
    functionsHit = 0;
  for (const coverage of merged.values()) {
    lines += coverage.lines.size;
    branches += coverage.branches.size;
    functions += coverage.functions.size;
    for (const count of coverage.lines.values()) if (count > 0) linesHit += 1;
    for (const count of coverage.branches.values()) if (count > 0) branchesHit += 1;
    for (const count of coverage.functions.values()) if (count > 0) functionsHit += 1;
  }
  return {
    files: merged.size,
    lines: { total: lines, hit: linesHit, percent: round(percent(linesHit, lines)) },
    branches: {
      total: branches,
      hit: branchesHit,
      percent: round(percent(branchesHit, branches)),
    },
    functions: {
      total: functions,
      hit: functionsHit,
      percent: round(percent(functionsHit, functions)),
    },
  };
}

export const defaultThresholds = Object.freeze({ lines: 65, branches: 60, functions: 60 });

/**
 * @param {ReturnType<typeof summarizeCoverage>} summary
 * @param {{lines: number, branches: number, functions: number}} thresholds
 * @returns {string[]}
 */
export function checkCoverage(summary, thresholds = defaultThresholds) {
  const failures = [];
  for (const metric of /** @type {const} */ (["lines", "branches", "functions"])) {
    const floor = thresholds[metric];
    if (summary[metric].percent < floor) {
      failures.push(
        `${metric} coverage ${summary[metric].percent}% is below the ${floor}% floor (${summary[metric].hit}/${summary[metric].total}).`,
      );
    }
  }
  return failures;
}

/** @param {ReturnType<typeof summarizeCoverage>} summary */
export function formatSummary(summary) {
  const row = (label, metric) =>
    `| ${label} | ${metric.percent}% | ${metric.hit}/${metric.total} |`;
  return [
    "### Test coverage (Node lanes)",
    "",
    "| Metric | Coverage | Hit |",
    "| --- | --- | --- |",
    row("Lines", summary.lines),
    row("Branches", summary.branches),
    row("Functions", summary.functions),
    "",
    `${summary.files} files measured.`,
  ].join("\n");
}

export function parseThresholds(value) {
  if (!value) return defaultThresholds;
  return { ...defaultThresholds, ...JSON.parse(value) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const files = argv.filter((argument) => !argument.startsWith("--"));
  const thresholdFlag = argv.indexOf("--thresholds");
  if (files.length === 0) {
    console.error("Usage: check-coverage.mjs <lcov...> [--thresholds '{\"lines\":70}']");
    process.exitCode = 1;
  } else {
    const thresholds = parseThresholds(thresholdFlag === -1 ? undefined : argv[thresholdFlag + 1]);
    const documents = files.map((file) => parseLcov(readFileSync(file, "utf8")));
    const summary = summarizeCoverage(mergeCoverage(documents));
    const report = formatSummary(summary);
    console.log(report);
    const failures = checkCoverage(summary, thresholds);
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    } else if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
    }
  }
}
