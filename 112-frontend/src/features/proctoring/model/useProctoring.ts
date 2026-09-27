import { proctoringApi } from "@/entities/training";
import { type FocusKind } from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import { useEffect, useState } from "react";

export function useProctoring(attemptId: string | undefined, active: boolean) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!attemptId || !active) return;
    let queue: {
      command_id: string;
      kind: FocusKind;
      client_occurred_at: string;
    }[] = [];
    let sending = false;
    let disposed = false;
    const flush = async () => {
      if (sending || !queue.length) return;
      sending = true;
      const batch = queue.slice(0, 20);
      try {
        await proctoringApi.proctoring(attemptId, batch);
        queue = queue.slice(batch.length);
        if (!disposed) setFailed(false);
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        sending = false;
      }
    };
    const record = (kind: FocusKind) => {
      if (queue.length < 200)
        queue.push({
          command_id: randomUUID(),
          kind,
          client_occurred_at: new Date().toISOString(),
        });
      void flush();
    };
    const visibility = () =>
      record(document.hidden ? "tab.hidden" : "tab.visible");
    const focus = () => record("window.focus");
    const blur = () => record("window.blur");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    const timer = window.setInterval(() => void flush(), 5000);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      window.clearInterval(timer);
      void flush();
    };
  }, [attemptId, active]);
  return failed;
}
