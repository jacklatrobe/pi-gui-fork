import { expect, test } from "@playwright/test";
import { drawWindowControlsArgument } from "../../contracts/ipc";
import { windowChromeArguments, windowChromeOptions } from "../../electron/windows/window-chrome";

/**
 * Only Linux gets a frameless window (the renderer draws its title bar there).
 * Windows keeps its native chrome. Runs in Node.
 */

test("Windows keeps its existing window chrome", () => {
  expect(windowChromeOptions("win32")).toEqual({
    titleBarStyle: undefined,
    autoHideMenuBar: true,
  });
  expect(windowChromeArguments("win32")).toEqual([]);
});

test("Linux hides the native title bar and menu bar", () => {
  expect(windowChromeOptions("linux")).toEqual({
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
  });
  expect(windowChromeArguments("linux")).toEqual([drawWindowControlsArgument]);
});
