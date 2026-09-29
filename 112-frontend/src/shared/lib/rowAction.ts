import type { HTMLAttributes } from "react";

const controls =
  "a, button, input, select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [contenteditable='true'], [data-row-control]";

/** Preserve nested controls and text selection; keyboard activation belongs to the row itself. */
export function rowAction(
  onActivate: () => void,
): HTMLAttributes<HTMLTableRowElement> {
  return {
    className: "table-clickable-row",
    tabIndex: 0,
    onClick(event) {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (event.target instanceof Element && event.target.closest(controls))
        return;
      if (window.getSelection()?.toString()) return;
      onActivate();
    },
    onKeyDown(event) {
      if (
        event.defaultPrevented ||
        event.target !== event.currentTarget ||
        event.repeat
      )
        return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
