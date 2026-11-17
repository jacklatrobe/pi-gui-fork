import type { Dispatch, SetStateAction } from "react";
import type { CreateScheduledTaskInput, DesktopAppState } from "../../../contracts/desktop-state";
import type { PiDesktopApi } from "../../../contracts/ipc";
import type { ScheduledEditorState } from "./scheduled-task-editor";

type ScheduledTaskApi = Pick<
  PiDesktopApi,
  "updateScheduledTask" | "deleteScheduledTask" | "createScheduledTask"
>;

type UpdateSnapshot = (
  setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
  action: () => Promise<DesktopAppState>,
) => Promise<DesktopAppState>;

export interface ScheduledTaskLifecycleActionsOptions {
  readonly api: ScheduledTaskApi;
  readonly updateSnapshot: UpdateSnapshot;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
  readonly scheduledEditor: ScheduledEditorState | null;
  readonly setScheduledEditor: (state: ScheduledEditorState | null) => void;
}

/**
 * Save, pause/resume, and cancel the scheduled task open in the editor. The editor
 * closes on success so the list reflects the change without a second dismissal.
 */
export function useScheduledTaskLifecycleActions({
  api,
  updateSnapshot,
  setSnapshot,
  scheduledEditor,
  setScheduledEditor,
}: ScheduledTaskLifecycleActionsOptions) {
  const closeOnSuccess = (state: DesktopAppState) => {
    if (!state.lastError) {
      setScheduledEditor(null);
    }
  };

  const handleSubmitScheduledTask = (input: CreateScheduledTaskInput) => {
    const action =
      scheduledEditor?.mode === "edit"
        ? () => api.updateScheduledTask(scheduledEditor.taskId, input)
        : () => api.createScheduledTask(input);
    void updateSnapshot(setSnapshot, action)
      .then(closeOnSuccess)
      .catch((error: unknown) => {
        console.error("[renderer] save scheduled task failed", error);
      });
  };

  const handleSetScheduledTaskStatus = (status: "active" | "paused") => {
    if (scheduledEditor?.mode !== "edit") {
      return;
    }
    void updateSnapshot(setSnapshot, () =>
      api.updateScheduledTask(scheduledEditor.taskId, { status }),
    ).catch((error: unknown) => {
      console.error("[renderer] updateScheduledTask status failed", error);
    });
  };

  const handleCancelScheduledTask = () => {
    if (scheduledEditor?.mode !== "edit") {
      return;
    }
    void updateSnapshot(setSnapshot, () => api.deleteScheduledTask(scheduledEditor.taskId))
      .then(closeOnSuccess)
      .catch((error: unknown) => {
        console.error("[renderer] deleteScheduledTask failed", error);
      });
  };

  return {
    handleSubmitScheduledTask,
    handleSetScheduledTaskStatus,
    handleCancelScheduledTask,
  };
}
