import { expect, test } from "@playwright/test";
import { nextThreadShortcutHintsVisible } from "../../src/features/threads/thread-shortcut-hints";

/** Each entry is "down|up <key> [flags]": the modifiers the event reports held, or "terminal". */
function run(events: readonly string[]): boolean {
  let visible = false;
  for (const entry of events) {
    const [type, key, ...held] = entry.split(" ");
    visible = nextThreadShortcutHintsVisible(visible, {
      type: type === "down" ? "keydown" : "keyup",
      key,
      code: /^[0-9]$/.test(key) ? `Digit${key}` : key,
      inTerminal: held.includes("terminal"),
      metaKey: held.includes("meta"),
      ctrlKey: held.includes("ctrl"),
      shiftKey: held.includes("shift"),
      altKey: held.includes("alt"),
    });
  }
  return visible;
}

test("shows hints for Control", () => {
  expect(run(["down Control ctrl"])).toBe(true);
  expect(run(["down Meta meta"])).toBe(false);
});

test("hides hints on release", () => {
  expect(run(["down Control ctrl", "up Control"])).toBe(false);
});

test("keeps hints through thread switches while the modifier is held", () => {
  expect(run(["down Control ctrl", "down 1 ctrl", "up 1 ctrl"])).toBe(true);
  expect(run(["down Control ctrl", "down 1 ctrl", "down 3 ctrl"])).toBe(true);
  // Main can consume the digit keydown, so only its keyup reaches the renderer.
  expect(run(["down Control ctrl", "up 1 ctrl"])).toBe(true);
  expect(run(["down Control ctrl", "down 1 ctrl", "up 1 ctrl", "up Control"])).toBe(false);
});

test("hides hints once another key is pressed until the modifier is pressed again", () => {
  expect(run(["down Control ctrl", "down k ctrl", "up k ctrl"])).toBe(false);
  expect(run(["down Control ctrl", "down 0 ctrl"])).toBe(false);
  expect(run(["down Control ctrl", "down 1 ctrl shift"])).toBe(false);
  // Ctrl+1-9 in the terminal goes to the shell, not a thread switch.
  expect(run(["down Control ctrl", "down 1 ctrl terminal"])).toBe(false);
  expect(run(["down Control ctrl", "down Shift ctrl shift", "up Shift ctrl"])).toBe(false);
  expect(run(["down Control ctrl", "down Alt ctrl alt", "up Alt ctrl"])).toBe(false);
  expect(run(["down Control ctrl", "down k ctrl", "down Control ctrl"])).toBe(true);
});

test("hides hints when an event reports the modifier up without its keyup", () => {
  expect(run(["down Control ctrl", "up 1"])).toBe(false);
});

test("ignores the modifier when Shift or AltGr is part of the press", () => {
  expect(run(["down Shift shift", "down Control ctrl shift"])).toBe(false);
  expect(run(["down Control ctrl", "down AltGraph ctrl alt"])).toBe(false);
});

test("ends thread hints when Alt joins the held modifier", () => {
  expect(run(["down Control ctrl", "down Alt ctrl alt"])).toBe(false);
});
