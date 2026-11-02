import { expect, test } from "@playwright/test";
import {
  desktopCommands,
  getSidePanelTabCommand,
  getSidePanelTabShortcutLabel,
  sidePanelTabIndex,
} from "../../contracts/ipc";
import { nextSidePanelTabHintsVisible } from "../../src/features/workbench/side-panel-tab-hints";

const chord = (held: string, key: string, code = `Digit${key}`) => ({
  meta: held.includes("meta"),
  control: held.includes("ctrl"),
  alt: held.includes("alt"),
  shift: held.includes("shift"),
  key,
  code,
});

test("maps Alt+1-9 to side panel tabs", () => {
  expect(getSidePanelTabCommand(chord("alt", "2"))).toBe(desktopCommands.selectSidePanelTab2);
  expect(getSidePanelTabCommand(chord("alt", "9"))).toBe(desktopCommands.selectSidePanelTab9);
  // AZERTY reports the symbol as the key; the physical digit still counts.
  expect(getSidePanelTabCommand(chord("alt", "&", "Digit1"))).toBe(
    desktopCommands.selectSidePanelTab1,
  );
  expect(sidePanelTabIndex(desktopCommands.selectSidePanelTab4)).toBe(3);
  expect(sidePanelTabIndex(desktopCommands.selectRecentThread4)).toBeUndefined();
});

test("leaves thread chords, extra modifiers, 0 and keypad digits alone", () => {
  expect(getSidePanelTabCommand(chord("ctrl", "1"))).toBeUndefined();
  expect(getSidePanelTabCommand(chord("meta", "1"))).toBeUndefined();
  expect(getSidePanelTabCommand(chord("alt meta", "1"))).toBeUndefined();
  expect(getSidePanelTabCommand(chord("alt shift", "1"))).toBeUndefined();
  // AltGr reports Control and Alt on Windows.
  expect(getSidePanelTabCommand(chord("ctrl alt", "1"))).toBeUndefined();
  expect(getSidePanelTabCommand(chord("alt", "0"))).toBeUndefined();
  // Windows Alt codes type characters from the keypad.
  expect(getSidePanelTabCommand(chord("alt", "1", "Numpad1"))).toBeUndefined();
});

test("labels tab shortcuts", () => {
  expect(getSidePanelTabShortcutLabel(2)).toBe("Alt+2");
  expect(getSidePanelTabShortcutLabel(9)).toBe("Alt+9");
});

/** Each entry is "down|up <key> [flags]": the modifiers the event reports held. */
function hints(events: readonly string[]): boolean {
  let visible = false;
  for (const entry of events) {
    const [type, key, ...held] = entry.split(" ");
    visible = nextSidePanelTabHintsVisible(visible, {
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

test("shows tab hints while Alt is held", () => {
  expect(hints(["down Alt alt"])).toBe(true);
  expect(hints(["down Control ctrl"])).toBe(false);
  expect(hints(["down Meta meta"])).toBe(false);
  expect(hints(["down Alt alt", "up Alt"])).toBe(false);
});

test("keeps tab hints through tab switches, including from the terminal", () => {
  expect(hints(["down Alt alt", "down 2 alt", "up 2 alt"])).toBe(true);
  expect(hints(["down Alt alt", "down 1 alt terminal", "down 3 alt"])).toBe(true);
  expect(hints(["down Alt alt", "down Tab alt"])).toBe(false);
  expect(hints(["down Alt alt", "down Control alt ctrl"])).toBe(false);
});
