import { useEffect, useMemo, useState } from "react";
import { trainingApi } from "@/entities/training";
import { createObservationBuffer } from "./observationBuffer";

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
        (events) => trainingApi.observations(attemptId, events),
        setFailed,
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
