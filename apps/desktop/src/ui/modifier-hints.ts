import { useEffect, useSyncExternalStore } from "react";

type ModifierState = Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">;
export type HintKeyEvent = ModifierState &
  Pick<KeyboardEvent, "type" | "key" | "code" | "shiftKey"> & {
    readonly inTerminal: boolean;
  };

export interface ModifierHintSpec {
  /** KeyboardEvent.key of the modifier whose press shows the hints. */
  readonly modifierKey: () => string;
  /** Whether an event reports the hint modifier held, and no other modifier. */
  readonly held: (event: ModifierState) => boolean;
  /** Whether a keydown with the modifier held is a shortcut the hints label. */
  readonly keepsHints: (event: HintKeyEvent) => boolean;
}

/**
 * Hints that show from a press of one modifier until it is released. A labelled
 * shortcut keeps them up while the modifier stays held; any other key ends them
 * until the modifier is pressed again. A key or pointer event reporting the
 * modifier up also ends them, because the main process can consume a chord and
 * drop the modifier keyup; until such an event or a window blur, they stay up.
 */
export function createModifierHints(spec: ModifierHintSpec) {
  const next = (current: boolean, event: HintKeyEvent): boolean => {
    if (event.key === spec.modifierKey()) {
      return event.type === "keydown" && !event.shiftKey && spec.held(event);
    }
    if (!current || !spec.held(event)) return false;
    if (event.type !== "keydown") return true;
    return spec.keepsHints(event);
  };

  let visible = false;
  const listeners = new Set<() => void>();
  const setVisible = (value: boolean) => {
    if (visible === value) return;
    visible = value;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  /** Main-process shortcuts never reach the renderer as keydown; end hints on them. */
  const dismiss = () => setVisible(false);

  const useVisible = (): boolean => {
    useEffect(() => {
      const syncKey = (event: KeyboardEvent) => {
        // KeyboardEvent fields are prototype getters, so copy them rather than spread.
        const { type, key, code, metaKey, ctrlKey, shiftKey, altKey, target } = event;
        const inTerminal =
          target instanceof Element && target.closest("[data-pi-terminal]") !== null;
        setVisible(
          next(visible, { type, key, code, metaKey, ctrlKey, shiftKey, altKey, inTerminal }),
        );
      };
      const syncPointer = (event: PointerEvent) => {
        if (visible && !spec.held(event)) dismiss();
      };
      window.addEventListener("keydown", syncKey);
      window.addEventListener("keyup", syncKey);
      window.addEventListener("pointermove", syncPointer);
      window.addEventListener("pointerdown", syncPointer);
      window.addEventListener("blur", dismiss);
      return () => {
        window.removeEventListener("keydown", syncKey);
        window.removeEventListener("keyup", syncKey);
        window.removeEventListener("pointermove", syncPointer);
        window.removeEventListener("pointerdown", syncPointer);
        window.removeEventListener("blur", dismiss);
        dismiss();
      };
    }, []);
    return useSyncExternalStore(subscribe, () => visible);
  };

  return { next, dismiss, useVisible };
}
