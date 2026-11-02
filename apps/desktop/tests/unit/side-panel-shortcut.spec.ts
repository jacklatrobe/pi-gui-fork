import { expect, test } from "@playwright/test";
import {
  desktopCommands,
  getDesktopCommandFromShortcut,
  getSidePanelToggleShortcutLabel,
  isCloseFocusedSurfaceShortcut,
} from "../../contracts/ipc";

const closeChord = (held: Partial<Record<"meta" | "control" | "alt" | "shift", boolean>>) => ({
  meta: false,
  control: false,
  alt: false,
  shift: false,
  key: "w",
  code: "KeyW",
  ...held,
});

test("maps Alt+B to the side panel and leaves plain B on the sidebar", () => {
  expect(
    getDesktopCommandFromShortcut({
      modifier: true,
      alt: true,
      shift: false,
      key: "b",
      code: "KeyB",
    }),
  ).toBe(desktopCommands.toggleSidePanel);
  expect(
    getDesktopCommandFromShortcut({
      modifier: true,
      alt: true,
      shift: false,
      key: "∫",
      code: "KeyB",
    }),
  ).toBe(desktopCommands.toggleSidePanel);
  expect(
    getDesktopCommandFromShortcut({
      modifier: true,
      alt: true,
      shift: false,
      key: "j",
      code: "KeyJ",
    }),
  ).toBeUndefined();
  expect(
    getDesktopCommandFromShortcut({
      modifier: true,
      alt: false,
      shift: false,
      key: "b",
      code: "KeyB",
    }),
  ).toBe(desktopCommands.toggleSidebar);
  expect(
    getDesktopCommandFromShortcut({ modifier: true, shift: false, key: "b", code: "KeyB" }),
  ).toBe(desktopCommands.toggleSidebar);
  expect(
    getDesktopCommandFromShortcut({ modifier: true, shift: false, key: "r", code: "KeyR" }),
  ).toBe(desktopCommands.toggleReview);
  expect(getSidePanelToggleShortcutLabel()).toBe("Ctrl+Alt+B");
  expect(
    getDesktopCommandFromShortcut({
      modifier: true,
      alt: false,
      shift: false,
      key: "w",
      code: "KeyW",
    }),
  ).toBeUndefined();
});

test("maps Control+W to closing the focused surface", () => {
  expect(isCloseFocusedSurfaceShortcut(closeChord({ control: true }))).toBe(true);
  // The Windows key or the Command modifier must not close a surface.
  expect(isCloseFocusedSurfaceShortcut(closeChord({ meta: true }))).toBe(false);
  expect(isCloseFocusedSurfaceShortcut(closeChord({ control: true, meta: true }))).toBe(false);
  expect(isCloseFocusedSurfaceShortcut(closeChord({ control: true, alt: true }))).toBe(false);
  expect(isCloseFocusedSurfaceShortcut(closeChord({ control: true, shift: true }))).toBe(false);
});
