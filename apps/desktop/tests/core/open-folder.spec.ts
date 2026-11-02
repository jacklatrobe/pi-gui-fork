import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  expectNewThreadWorkspace,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  stubNextOpenDialog,
} from "../helpers/electron-app";

test("adds a workspace from the empty state button using a stubbed folder selection", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("native-open-folder-workspace");
  const harness = await launchDesktop(userDataDir, { testMode: "background" });

  try {
    const window = await harness.firstWindow();
    await expect(window.getByTestId("empty-state")).toBeVisible();

    await stubNextOpenDialog(harness, [workspacePath]);
    await window.getByRole("button", { name: "Open first folder" }).click();

    await expect
      .poll(
        async () => {
          const state = await getDesktopState(window);
          const selectedWorkspace = state.workspaces.find(
            (workspace) => workspace.id === state.selectedWorkspaceId,
          );
          return selectedWorkspace?.path ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(workspacePath);

    await expect(window.getByTestId("workspace-list")).toContainText(basename(workspacePath));
    await expectNewThreadWorkspace(window, workspacePath);
  } finally {
    await harness.close();
  }
});
