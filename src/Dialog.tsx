import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The app's modal: opens on mount, focuses the first text field (or `initialFocus`), closes on Escape or a backdrop
 * click. A `persistent` one closes only through its own buttons, for a flow that loses its picks when it closes
 * (onboarding).
 */
export default function Dialog({
  title,
  onClose,
  children,
  className,
  actions,
  persistent,
  initialFocus = "input:not([type='checkbox']), textarea",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Buttons beside Close, such as a theme switch. */
  actions?: ReactNode;
  persistent?: boolean;
  /** What takes focus on open; when nothing matches, the browser's own pick (the first control) stays. */
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>(initialFocus)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once, on open
  }, []);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a modal <dialog>: backdrop clicks close it, and keys delegate to its search results.
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      // closedby="none" stops Chromium's close watcher too, which honours a cancelled Escape only once per user activation.
      {...persistent && { closedby: "none" }}
      onCancel={(event) => { if (persistent) event.preventDefault(); else onClose(); }}
      onKeyDown={(event) => {
        if (!(event.target as HTMLElement).matches(".dialog-search input, [data-search-result]")) return;
        const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-search-result]")];
        if (!rows.length) return;
        const index = rows.indexOf(event.target as HTMLButtonElement);
        if (event.key === "Enter" && index === -1) {
          event.preventDefault();
          rows[0].click();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = index < 0 ? (event.key === "ArrowDown" ? 0 : rows.length - 1) :
            (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
          rows[next].focus({ preventScroll: true });
          rows[next].scrollIntoView({ block: "nearest" });
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !persistent) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        {actions}
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
