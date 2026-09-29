/** The selected source also supports copying on HTTP stands without Clipboard API. */
export async function copyText(text: string, source: HTMLElement): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browser permissions may block Clipboard API while allowing a user copy.
    }
  }
  const selection = window.getSelection();
  if (!selection) throw new Error("Copy unavailable");
  const previousRanges = Array.from({ length: selection.rangeCount }, (_, i) =>
    selection.getRangeAt(i).cloneRange(),
  );
  const range = document.createRange();
  range.selectNodeContents(source);
  try {
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("copy")) throw new Error("Copy rejected");
  } finally {
    selection.removeAllRanges();
    previousRanges.forEach((previous) => selection.addRange(previous));
  }
}
