import { useTranslation, type MessageKey } from "../../i18n";
import { SettingsGroup, SettingsRow } from "./settings-utils";

/** "Alt" is the side panel tab modifier; "Ctrl" is Control everywhere else. */
type KeyModifier = "Ctrl" | "Alt" | "Shift";

interface Shortcut {
  readonly titleKey: MessageKey;
  readonly modifiers: readonly KeyModifier[];
  readonly key: string;
}

interface ShortcutGroup {
  readonly titleKey: MessageKey;
  readonly shortcuts: readonly Shortcut[];
}

// Mirrors getDesktopCommandFromShortcut in contracts/ipc.ts and the keys the renderer handles
// itself (find, thread switcher, composer, terminal tabs).
const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    titleKey: "settings.shortcuts.groupApp",
    shortcuts: [
      { titleKey: "settings.shortcuts.commandPalette", modifiers: ["Ctrl"], key: "K" },
      { titleKey: "settings.shortcuts.goToFile", modifiers: ["Ctrl"], key: "P" },
      { titleKey: "settings.shortcuts.openSettings", modifiers: ["Ctrl"], key: "," },
      { titleKey: "settings.shortcuts.toggleSidebar", modifiers: ["Ctrl"], key: "B" },
      { titleKey: "settings.shortcuts.toggleSidePanel", modifiers: ["Ctrl", "Alt"], key: "B" },
      { titleKey: "settings.shortcuts.newWindow", modifiers: ["Ctrl", "Shift"], key: "N" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groupThreads",
    shortcuts: [
      { titleKey: "settings.shortcuts.newThread", modifiers: ["Ctrl"], key: "N" },
      { titleKey: "settings.shortcuts.switchRecent", modifiers: ["Ctrl"], key: "1–9" },
      { titleKey: "settings.shortcuts.cycleThreads", modifiers: ["Ctrl"], key: "Tab" },
      { titleKey: "settings.shortcuts.findInThread", modifiers: ["Ctrl"], key: "F" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groupComposer",
    shortcuts: [
      { titleKey: "settings.shortcuts.send", modifiers: [], key: "Enter" },
      { titleKey: "settings.shortcuts.steer", modifiers: ["Ctrl"], key: "Enter" },
      { titleKey: "settings.shortcuts.newLine", modifiers: ["Shift"], key: "Enter" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groupWorkbench",
    shortcuts: [
      { titleKey: "settings.shortcuts.toggleTerminal", modifiers: ["Ctrl"], key: "J" },
      { titleKey: "settings.shortcuts.newTerminalTab", modifiers: ["Ctrl"], key: "T" },
      { titleKey: "settings.shortcuts.toggleReview", modifiers: ["Ctrl"], key: "R" },
      { titleKey: "settings.shortcuts.switchSidePanelTab", modifiers: ["Alt"], key: "1–9" },
      { titleKey: "settings.shortcuts.closeWorkbenchTab", modifiers: ["Ctrl"], key: "W" },
    ],
  },
];

function shortcutKeys(shortcut: Shortcut): readonly string[] {
  const modifiers = (["Ctrl", "Alt", "Shift"] as const).filter((modifier) =>
    shortcut.modifiers.includes(modifier),
  );
  return [...modifiers, shortcut.key];
}

export function SettingsShortcutsSection() {
  const { t } = useTranslation();
  return (
    <>
      {SHORTCUT_GROUPS.map((group) => (
        <SettingsGroup key={group.titleKey} title={t(group.titleKey)}>
          {group.shortcuts.map((shortcut) => (
            <SettingsRow key={shortcut.titleKey} title={t(shortcut.titleKey)}>
              <span className="settings-keys">
                {shortcutKeys(shortcut).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}
    </>
  );
}
