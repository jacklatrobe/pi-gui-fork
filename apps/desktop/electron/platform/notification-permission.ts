import { app, type BrowserWindow, shell } from "electron";
import { appendFile } from "node:fs/promises";
import type { DesktopNotificationPermissionStatus } from "../../contracts/ipc";

const TEST_STATUS_ENV = "PI_APP_TEST_NOTIFICATION_PERMISSION_STATUS";
const TEST_REQUEST_RESULT_ENV = "PI_APP_TEST_NOTIFICATION_PERMISSION_REQUEST_RESULT";
const TEST_REQUEST_LOG_PATH_ENV = "PI_APP_TEST_NOTIFICATION_PERMISSION_REQUEST_LOG_PATH";
const TEST_SETTINGS_LOG_PATH_ENV = "PI_APP_TEST_NOTIFICATION_SETTINGS_LOG_PATH";
const RECONCILIATION_POLL_INTERVAL_MS = 500;
const RECONCILIATION_MAX_POLLS = 20;

let testPermissionStatus = normalizePermissionStatus(process.env[TEST_STATUS_ENV]);

export class NotificationPermissionService {
  private window: BrowserWindow | null = null;
  private stopTrackingWindow: (() => void) | undefined;
  private readonly listeners = new Set<(status: DesktopNotificationPermissionStatus) => void>();
  private lastPublishedStatus: DesktopNotificationPermissionStatus = "unknown";
  private reconciliationBaselineStatus: DesktopNotificationPermissionStatus | null = null;
  private reconciliationPollTimer: ReturnType<typeof setTimeout> | undefined;
  private reconciliationPollCount = 0;
  private readonly handleAppReactivation = () => {
    void this.reconcileOnActivation().catch((error: unknown) => {
      console.error("[notification-permission] reconcileOnActivation failed", error);
    });
  };

  constructor(private readonly getWindow: () => BrowserWindow | null) {
    app.on("activate", this.handleAppReactivation);
    app.on("browser-window-focus", this.handleAppReactivation);
  }

  dispose(): void {
    app.off("activate", this.handleAppReactivation);
    app.off("browser-window-focus", this.handleAppReactivation);
    this.clearReconciliationPoll();
    this.trackWindow(null);
    this.listeners.clear();
  }

  trackWindow(window: BrowserWindow | null): void {
    if (window === this.window) {
      return;
    }

    this.stopTrackingWindow?.();
    this.stopTrackingWindow = undefined;
    this.window = window && !window.isDestroyed() ? window : null;
    if (!this.window) {
      return;
    }

    const handleWindowActivation = () => {
      void this.reconcileOnActivation().catch((error: unknown) => {
        console.error("[notification-permission] reconcileOnActivation failed", error);
      });
    };
    const clearTrackedWindow = () => {
      this.trackWindow(null);
    };

    this.window.on("focus", handleWindowActivation);
    this.window.on("show", handleWindowActivation);
    this.window.on("restore", handleWindowActivation);
    this.window.once("closed", clearTrackedWindow);
    this.stopTrackingWindow = () => {
      this.window?.off("focus", handleWindowActivation);
      this.window?.off("show", handleWindowActivation);
      this.window?.off("restore", handleWindowActivation);
      this.window?.off("closed", clearTrackedWindow);
    };
  }

  subscribe(listener: (status: DesktopNotificationPermissionStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getCurrentStatus(): Promise<DesktopNotificationPermissionStatus> {
    const status = await readNotificationPermissionStatus(this.getWindow());
    this.publish(status);
    return status;
  }

  async requestPermission(): Promise<DesktopNotificationPermissionStatus> {
    const status = await requestNotificationPermissionInternal(this.getWindow());
    this.publish(status);
    return status;
  }

  async ensurePermission(): Promise<DesktopNotificationPermissionStatus> {
    const current = await this.getCurrentStatus();
    if (current !== "default") {
      return current;
    }
    return this.requestPermission();
  }

  async openSystemSettings(): Promise<void> {
    this.reconciliationBaselineStatus = await this.getCurrentStatus();
    this.clearReconciliationPoll();
    await openSystemNotificationSettingsInternal();
  }

  private async reconcileOnActivation(): Promise<void> {
    const status = await this.getCurrentStatus();
    const baseline = this.reconciliationBaselineStatus;
    if (baseline === null) {
      return;
    }
    if (status !== baseline) {
      this.reconciliationBaselineStatus = null;
      this.clearReconciliationPoll();
      return;
    }
    this.startReconciliationPoll();
  }

  private startReconciliationPoll(): void {
    if (this.reconciliationPollTimer) {
      return;
    }

    this.reconciliationPollCount = 0;
    const tick = async () => {
      const baseline = this.reconciliationBaselineStatus;
      if (baseline === null) {
        this.clearReconciliationPoll();
        return;
      }

      const status = await this.getCurrentStatus();
      this.reconciliationPollCount += 1;
      if (status !== baseline || this.reconciliationPollCount >= RECONCILIATION_MAX_POLLS) {
        this.reconciliationBaselineStatus = null;
        this.clearReconciliationPoll();
        return;
      }

      this.reconciliationPollTimer = setTimeout(() => {
        void tick().catch((error: unknown) => {
          console.error("[notification-permission] tick failed", error);
        });
      }, RECONCILIATION_POLL_INTERVAL_MS);
    };

    this.reconciliationPollTimer = setTimeout(() => {
      void tick().catch((error: unknown) => {
        console.error("[notification-permission] tick failed", error);
      });
    }, RECONCILIATION_POLL_INTERVAL_MS);
  }

  private clearReconciliationPoll(): void {
    if (!this.reconciliationPollTimer) {
      return;
    }
    clearTimeout(this.reconciliationPollTimer);
    this.reconciliationPollTimer = undefined;
    this.reconciliationPollCount = 0;
  }

  private publish(status: DesktopNotificationPermissionStatus): void {
    if (status === this.lastPublishedStatus) {
      return;
    }
    this.lastPublishedStatus = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

async function readNotificationPermissionStatus(
  window: BrowserWindow | null,
): Promise<DesktopNotificationPermissionStatus> {
  if (testPermissionStatus) {
    return testPermissionStatus;
  }

  return readRendererNotificationPermission(window);
}

async function requestNotificationPermissionInternal(
  window: BrowserWindow | null,
): Promise<DesktopNotificationPermissionStatus> {
  await logPermissionRequestAttempt();
  const override = normalizePermissionStatus(process.env[TEST_REQUEST_RESULT_ENV]);
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    if (override) {
      testPermissionStatus = override;
      return override;
    }
    return "unknown";
  }

  try {
    const value: unknown = await window.webContents.executeJavaScript(
      override
        ? `globalThis.Notification ? Promise.resolve(${JSON.stringify(override)}) : Promise.resolve("unsupported")`
        : `globalThis.Notification ? Notification.requestPermission() : Promise.resolve("unsupported")`,
      true,
    );
    const normalized = normalizePermissionStatus(value) ?? "unknown";
    if (override) {
      testPermissionStatus = normalized;
    }
    return readNotificationPermissionStatus(window);
  } catch {
    return "unknown";
  }
}

async function openSystemNotificationSettingsInternal(): Promise<void> {
  const testLogPath = process.env[TEST_SETTINGS_LOG_PATH_ENV]?.trim();
  if (testLogPath) {
    await appendFile(testLogPath, `${new Date().toISOString()}\n`, "utf8");
    return;
  }

  // Windows deep-links straight to its notification settings; Linux has no
  // portable settings URI, so the call is a no-op there.
  if (process.platform === "win32") {
    await shell.openExternal("ms-settings:notifications");
  }
}

async function readRendererNotificationPermission(
  window: BrowserWindow | null,
): Promise<DesktopNotificationPermissionStatus> {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return "unknown";
  }

  try {
    const value: unknown = await window.webContents.executeJavaScript(
      `globalThis.Notification?.permission ?? "unsupported"`,
      true,
    );
    return normalizePermissionStatus(value) ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function logPermissionRequestAttempt(): Promise<void> {
  const testLogPath = process.env[TEST_REQUEST_LOG_PATH_ENV]?.trim();
  if (!testLogPath) {
    return;
  }

  await appendFile(testLogPath, `${new Date().toISOString()}\n`, "utf8");
}

function normalizePermissionStatus(
  value: unknown,
): DesktopNotificationPermissionStatus | undefined {
  switch (value) {
    case "granted":
    case "denied":
    case "default":
    case "unsupported":
    case "unknown":
      return value;
    default:
      return undefined;
  }
}
