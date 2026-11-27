// What App keeps running while it's open, beside drawing: the keyboard shortcuts and Back/Forward, and notes written
// offline (D56) sent once the browser is back online. App.tsx calls each once.
import { useEffect } from "react";
import type { RefObject } from "react";
import type { Actions } from "./actions.ts";
import { offlineMessage } from "./cloud.ts";
import { morph } from "./morph.ts";
import type { Outboxed } from "./outbox.ts";
import type { Ui, WorkbenchShellHandle } from "./ui.ts";
import type { Workbench } from "./workbench.ts";

/**
 * Ctrl/Cmd+K search, Ctrl/Cmd+J the chat (as in Notion; the Chats page already is the chat), C Capture from anywhere
 * you aren't typing (as in Linear and GitHub, agents-design D53), Alt+Shift+arrows the next or previous tab, and Back
 * or Forward going to the URL's place. None while a dialog is open.
 */
export function useShortcuts(workbench: Workbench, ui: Ui, actions: Actions, shell: RefObject<WorkbenchShellHandle | null>) {
  useEffect(() => {
    const onPop = () => {
      void workbench.navigate(new URL(location.href));
      shell.current?.showWorkspace();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || document.querySelector("dialog[open]")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.set(({ modal }) => ({ query: "", modal: modal === "search" ? null : "search" }));
      }
      if (command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j" && workbench.getSnapshot().session.view !== "chats") {
        event.preventDefault();
        morph(() => shell.current?.toggleChat());
      }
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
      if (event.key.toLowerCase() === "c" && !command && !event.altKey && !event.shiftKey && !typing) {
        event.preventDefault();
        actions.openCapture();
      }
      if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const current = workbench.getSnapshot().session;
        const index = current.tabs.indexOf(current.active);
        actions.openTab(current.tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + current.tabs.length) % current.tabs.length]);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [actions, shell, ui, workbench]);
}

/**
 * Notes written offline (D56): says they wait on this device, sends them when the browser is back online, says they
 * went. Android says it's online before requests get through, so a failed send tries again every 10 s while notes wait.
 */
export function useOutbox(outbox: Outboxed | null, actions: Actions) {
  useEffect(() => {
    if (!outbox) return;
    let retry: number | undefined;
    const send = () => {
      window.clearTimeout(retry);
      outbox.flush().catch((cause) => {
        if (navigator.onLine && cause instanceof Error && cause.message === offlineMessage) retry = window.setTimeout(send, 10_000);
      });
    };
    const stop = outbox.subscribe(({ waiting, sent, queued }) => {
      if (queued && waiting === 1) actions.toast("You're offline. The note waits on this device and saves when you're back.");
      if (sent) actions.toast(`Back online: ${sent === 1 ? "the note" : `${sent} notes`} you wrote offline ${sent === 1 ? "is" : "are"} saved.`);
    });
    window.addEventListener("online", send);
    return () => { stop(); window.clearTimeout(retry); window.removeEventListener("online", send); };
  }, [outbox, actions]);
}
