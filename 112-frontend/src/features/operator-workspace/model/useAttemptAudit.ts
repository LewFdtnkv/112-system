import { attemptApi } from "@/entities/training";
import { useEffect, useMemo, useState } from "react";
import { createObservationBuffer } from "./observationBuffer";
import { observationPersistence } from "./observationPersistence";

export function useAttemptAudit(
  attemptId: string,
  initialFields: unknown,
  active: boolean,
) {
  const [failed, setFailed] = useState(false);
  const [initial] = useState(initialFields);
  const buffer = useMemo(
    () =>
      createObservationBuffer(
        initial,
        (events) => attemptApi.observations(attemptId, events),
        setFailed,
        observationPersistence(attemptId),
      ),
    [attemptId, initial],
  );
  useEffect(() => {
    if (!active) return;
    buffer.open();
    return () => buffer.close();
  }, [active, buffer]);
  return { ...buffer, failed };
}
