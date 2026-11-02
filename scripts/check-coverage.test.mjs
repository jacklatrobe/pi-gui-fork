import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCoverage,
  defaultThresholds,
  formatSummary,
  mergeCoverage,
  parseLcov,
  parseThresholds,
  summarizeCoverage,
} from "./check-coverage.mjs";

const lcov = (file, lines) =>
  [
    `SF:${file}`,
    ...lines.map(([line, count]) => `DA:${line},${count}`),
    `LF:${lines.length}`,
    `LH:${lines.filter(([, count]) => count > 0).length}`,
    "end_of_record",
  ].join("\n");

test("parseLcov reads line, branch and function hits and normalizes separators", () => {
  const document = parseLcov(
    [
      "SF:dist\\node\\atomic-write.js",
      "DA:1,1",
      "DA:2,0",
      "BRDA:2,0,0,1",
      "BRDA:2,0,1,-",
      "FNDA:3,sleep",
      "FNDA:0,unused",
      "end_of_record",
      "",
    ].join("\n"),
  );
  const coverage = document.get("dist/node/atomic-write.js");
  assert.ok(coverage);
  assert.deepEqual(
    [...coverage.lines],
    [
      [1, 1],
      [2, 0],
    ],
  );
  assert.equal(coverage.branches.get("2|0|0"), 1);
  assert.equal(coverage.branches.get("2|0|1"), 0);
  assert.equal(coverage.functions.get("sleep"), 3);
  assert.equal(coverage.functions.get("unused"), 0);
});

test("merging unions hits per file instead of double counting shared files", () => {
  const first = parseLcov(
    lcov("a.ts", [
      [1, 1],
      [2, 0],
    ]),
  );
  const second = parseLcov(
    lcov("a.ts", [
      [1, 0],
      [2, 1],
      [3, 1],
    ]),
  );
  const summary = summarizeCoverage(mergeCoverage([first, second]));
  assert.equal(summary.files, 1);
  assert.deepEqual(summary.lines, { total: 3, hit: 3, percent: 100 });
});

test("empty coverage reports 100% and passes any floor", () => {
  const summary = summarizeCoverage(mergeCoverage([]));
  assert.equal(summary.lines.percent, 100);
  assert.equal(summary.branches.percent, 100);
  assert.deepEqual(checkCoverage(summary, defaultThresholds), []);
});

test("checkCoverage fails only the metrics below their floor", () => {
  const summary = summarizeCoverage(
    mergeCoverage([
      parseLcov(
        lcov("a.ts", [
          [1, 1],
          [2, 0],
          [3, 0],
          [4, 0],
        ]),
      ),
    ]),
  );
  assert.deepEqual(checkCoverage(summary, { lines: 25, branches: 0, functions: 0 }), []);
  const failures = checkCoverage(summary, { lines: 80, branches: 0, functions: 0 });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /lines coverage 25%/);
});

test("formatSummary renders every metric into the step summary", () => {
  const report = formatSummary(
    summarizeCoverage(mergeCoverage([parseLcov(lcov("a.ts", [[1, 1]]))])),
  );
  assert.match(report, /### Test coverage/);
  assert.match(report, /\| Lines \| 100% \| 1\/1 \|/);
});

test("parseThresholds overlays defaults and ignores empty input", () => {
  assert.equal(parseThresholds(undefined), defaultThresholds);
  assert.deepEqual(parseThresholds('{"lines":10}'), { ...defaultThresholds, lines: 10 });
});
