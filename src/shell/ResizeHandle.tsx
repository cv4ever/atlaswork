// The splitters between the sidebar, the page and the chat panel (the ARIA window-splitter pattern).
import { useRef } from "react";

export function ResizeHandle({
  kind,
  value,
  onCommit,
}: {
  kind: "sidebar" | "agent";
  value: number;
  onCommit: (width: number) => void;
}) {
  const drag = useRef<{ start: number; value: number; next: number } | null>(
    null,
  );
  const min = kind === "sidebar" ? 204 : 300;
  const max = kind === "sidebar" ? 300 : 480;
  return (
    // The window-splitter pattern: a focusable separator that arrow keys move.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={`resize-handle ${kind}-resize`}
      role="separator"
      aria-label={`Resize ${kind}`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onCommit(
          Math.min(
            max,
            Math.max(
              min,
              value +
                (event.key === "ArrowRight" ? 16 : -16) *
                  (kind === "agent" ? -1 : 1),
            ),
          ),
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { start: event.clientX, value, next: value };
        document.body.classList.add("resizing");
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        drag.current.next = Math.max(
          min,
          Math.min(
            max,
            drag.current.value +
              (event.clientX - drag.current.start) *
                (kind === "agent" ? -1 : 1),
          ),
        );
        document.documentElement.style.setProperty(
          `--${kind}-width`,
          `${drag.current.next}px`,
        );
      }}
      onPointerUp={() => {
        if (drag.current) onCommit(drag.current.next);
        drag.current = null;
        document.body.classList.remove("resizing");
      }}
      onPointerCancel={() => {
        document.documentElement.style.setProperty(
          `--${kind}-width`,
          `${value}px`,
        );
        drag.current = null;
        document.body.classList.remove("resizing");
      }}
    />
  );
}
