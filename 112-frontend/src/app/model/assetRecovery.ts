const failures = new WeakSet<object>();
const reloadKey = "112-asset-recovery-at";

export const isAssetLoadError = (error: unknown) =>
  typeof error === "object" && error !== null && failures.has(error);

export function installAssetRecovery() {
  window.addEventListener("vite:preloadError", (event) => {
    if (typeof event.payload === "object" && event.payload !== null)
      failures.add(event.payload);

    // Only entrance redirects can reload automatically: never discard an editor
    // or a student's unsaved work because an unrelated lazy module failed.
    if (!["/", "/login"].includes(window.location.pathname)) return;
    try {
      const previous = Number(sessionStorage.getItem(reloadKey) ?? 0);
      const now = Date.now();
      if (now - previous < 60_000) return;
      sessionStorage.setItem(reloadKey, String(now));
    } catch {
      // Without persistent storage we cannot guard against a reload loop.
      return;
    }
    window.location.reload();
  });
}
