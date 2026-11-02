import { getSidePanelTabCommand, sidePanelTabModifierHeld } from "../../../contracts/ipc";
import { createModifierHints } from "../../ui/modifier-hints";

const heldInput = (event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">) => ({
  meta: event.metaKey,
  control: event.ctrlKey,
  alt: event.altKey,
  shift: false,
});

/**
 * Tab number hints on side panel tabs, from a press of Alt until it is released.
 * Tab chords work from the terminal too.
 */
const sidePanelTabHints = createModifierHints({
  modifierKey: () => "Alt",
  held: (event) => sidePanelTabModifierHeld(heldInput(event)),
  keepsHints: (event) =>
    getSidePanelTabCommand({
      ...heldInput(event),
      shift: event.shiftKey,
      key: event.key,
      code: event.code,
    }) !== undefined,
});

export const nextSidePanelTabHintsVisible = sidePanelTabHints.next;
export const dismissSidePanelTabHints = sidePanelTabHints.dismiss;
export const useSidePanelTabHintsVisible = sidePanelTabHints.useVisible;
