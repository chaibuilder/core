import { isEmpty } from "lodash-es";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { undoManager, useUndoManager } from "~/builder/hooks/history/use-undo-manager";
import { useBlockKeyboardCommands } from "~/builder/hooks/use-block-keyboard-commands";
import { useReadOnlyMode } from "~/builder/hooks/use-read-only-mode";
import { isTextEntryTarget } from "~/builder/hooks/keyboard-target";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";

const shouldUseNativeClipboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const selection = event.view?.getSelection?.() ?? window.getSelection();
  const hasTextSelection = !!selection && !selection.isCollapsed;

  if (hasTextSelection) {
    return true;
  }

  return !!(
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest('[contenteditable="true"], [data-allow-native-copy="true"]'))
  );
};

export const useKeyEventWatcher = (doc?: Document) => {
  const [ids, setIds] = useSelectedBlockIds();
  const commands = useBlockKeyboardCommands();
  const { undo, redo } = useUndoManager();
  const { savePage } = useChaiSavePage();
  const readOnly = useReadOnlyMode() !== null;

  const getOptions = useCallback(
    ({
      checkForEnabled,
      preventDefault,
      ignoreTextEntry = true,
      enableOnContentEditable = false,
      readOnlySafe = false,
    }: {
      checkForEnabled?: boolean;
      preventDefault?: boolean;
      ignoreTextEntry?: boolean;
      enableOnContentEditable?: boolean;
      /** Stays on for a view-only page: it changes nothing there. */
      readOnlySafe?: boolean;
    }) => {
      const options: {
        document?: Document;
        enabled?: boolean;
        preventDefault?: boolean;
        enableOnFormTags?: boolean;
        enableOnContentEditable?: boolean;
        ignoreEventWhen?: (event: KeyboardEvent) => boolean;
      } = {
        enableOnFormTags: true,
        enableOnContentEditable,
        // Only defer to native/RTE editing on text-entry surfaces. Do NOT ignore
        // events whose target is the canvas <iframe> element: when a block is
        // selected, focus sits on the <iframe> element in the PARENT document, so
        // Cmd+C/V/X fire there — and the iframe's own document never receives them
        // (an iframe-document event can't cross the frame boundary, so there is no
        // double-fire to guard against). Ignoring iframe targets left copy/paste
        // dead unless focus happened to land inside the iframe document.
        ignoreEventWhen: (event) => ignoreTextEntry && isTextEntryTarget(event),
      };

      if (doc) options.document = doc;
      if (checkForEnabled) options.enabled = !isEmpty(ids);
      // A view-only page takes no edits: no undo, cut, paste, delete or duplicate.
      if (readOnly && !readOnlySafe) options.enabled = false;
      if (preventDefault) options.preventDefault = true;
      return options;
    },
    [doc, ids, readOnly],
  );

  useHotkeys(
    "ctrl+z,meta+z",
    (e) => {
      e.preventDefault();
      if (undoManager.hasUndo()) {
        undo();
      }
    },
    getOptions({ checkForEnabled: false, preventDefault: true }),
    [doc, undo],
  );
  useHotkeys(
    "ctrl+y,meta+y,ctrl+shift+z,meta+shift+z",
    (e) => {
      e.preventDefault();
      if (undoManager.hasRedo()) {
        redo();
      }
    },
    getOptions({ checkForEnabled: false, preventDefault: true }),
    [doc, redo],
  );
  useHotkeys(
    "ctrl+x,meta+x",
    (e) => {
      if (shouldUseNativeClipboard(e)) {
        return;
      }
      e.preventDefault();
      commands.cut();
    },
    getOptions({ checkForEnabled: true, preventDefault: false }),
    [doc, commands],
  );
  useHotkeys(
    "ctrl+c,meta+c",
    (e) => {
      if (shouldUseNativeClipboard(e)) {
        return;
      }
      e.preventDefault();
      commands.copy();
    },
    getOptions({ checkForEnabled: true, preventDefault: false }),
    [doc, commands],
  );
  useHotkeys(
    "ctrl+v,meta+v",
    () => {
      void commands.paste();
    },
    getOptions({ checkForEnabled: true, preventDefault: false }),
    [doc, commands],
  );
  useHotkeys(
    // react-hotkeys-hook v5 matches on the normalized KeyboardEvent.code, so
    // `Escape` becomes "escape" — the legacy "esc" token never matches (same
    // class as the "del" -> "delete" fix). Bind "escape" so Esc-to-deselect works.
    "escape",
    () => {
      const active = ((doc ?? document).activeElement ?? null) as HTMLElement | null;
      if (active && (active.matches("input, textarea, select") || active.isContentEditable)) {
        active.blur();
        return;
      }
      setIds([]);
    },
    getOptions({
      checkForEnabled: false,
      preventDefault: false,
      ignoreTextEntry: false,
      enableOnContentEditable: true,
      readOnlySafe: true,
    }),
    [doc, setIds],
  );
  useHotkeys(
    "ctrl+d,meta+d",
    () => {
      commands.duplicate();
    },
    getOptions({ checkForEnabled: true, preventDefault: true }),
    [doc, commands],
  );
  useHotkeys(
    // react-hotkeys-hook v5 matches on the normalized KeyboardEvent.code, where
    // Delete -> "delete" and Backspace -> "backspace". The old "del" token never
    // matches under v5 (it silently bound nothing), so spell both keys out.
    "backspace, delete",
    () => {
      commands.remove();
    },
    getOptions({ checkForEnabled: false, preventDefault: true }),
    [doc, commands],
  );
  useHotkeys(
    "mod+s",
    () => {
      savePage();
    },
    getOptions({
      checkForEnabled: false,
      preventDefault: true,
      ignoreTextEntry: false,
      enableOnContentEditable: true,
      readOnlySafe: true,
    }),
    [doc, savePage],
  );
};
