import {
  cardElapsedSeconds,
  ddsApi,
  useAttemptSnapshot,
  type Attempt,
} from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DDSWorkspaceProps } from "../types/DDSWorkspace";

export function useDDSWorkspace({
  initial,
  onSaved,
  onClose,
}: DDSWorkspaceProps) {
  const snapshot = useAttemptSnapshot(initial);
  const attempt = snapshot.data;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [activity, setActivity] = useState(0);
  const [activeService, setActiveService] = useState("");
  const [activeCrew, setActiveCrew] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<"service" | "crew">("service");
  const [crewCode, setCrewCode] = useState("");
  const [status, setStatus] = useState("");
  const [number, setNumber] = useState("");
  const [comment, setComment] = useState("");
  const [requestId, setRequestId] = useState(randomUUID);
  const [now, setNow] = useState(Date.now);
  const dds = attempt.dds!;
  const completed = attempt.status !== "in_progress";
  useEffect(() => {
    if (completed || dds.first_decision_at) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [completed, dds.first_decision_at]);
  const update = (value: Attempt) => {
    snapshot.update(value);
    setEditing(false);
    setComment("");
    setRequestId(randomUUID());
    onSaved();
  };
  const save = useMutation({
    scope: { id: `attempt:${attempt.id}` },
    onMutate: snapshot.cancelRead,
    mutationFn: () => {
      const current = snapshot.latest().dds!;
      const data = {
        request_id: requestId,
        revision: current.revision,
        information_event_id: current.information!.id,
        status,
        crew_number: number.trim() || null,
        comment,
      };
      return target === "service"
        ? ddsApi.action(attempt.id, data)
        : ddsApi.crew(attempt.id, { ...data, crew_code: crewCode });
    },
    onSuccess: (value) => {
      if (target === "crew") {
        setActiveService(dds.profile.service_id);
        setActiveCrew(
          dds.crews?.some((c) => c.crew_code === crewCode) ? crewCode : "",
        );
      }
      update(value);
    },
  });
  const finish = useMutation({
    scope: { id: `attempt:${attempt.id}` },
    onMutate: snapshot.cancelRead,
    mutationFn: () =>
      ddsApi.submit(attempt.id, snapshot.latest().dds!.revision),
    onSuccess: update,
  });
  const reload = () => {
    save.reset();
    finish.reset();
    void snapshot.refetch();
  };
  const busy = save.isPending || finish.isPending || snapshot.isFetching;
  const openEditor = (code?: string) => {
    const crew = dds.crews?.find((c) => c.crew_code === code);
    setTarget(code === undefined ? "service" : "crew");
    setCrewCode(code ?? "");
    setStatus(code !== undefined && !crew ? "assigned" : "");
    setNumber(
      code === undefined ? (dds.crew_number ?? "") : (crew?.crew_number ?? ""),
    );
    setComment("");
    setRequestId(randomUUID());
    save.reset();
    setEditing(true);
  };
  const changed = () => {
    setRequestId(randomUUID());
    setActivity(Date.now());
  };
  const elapsed = cardElapsedSeconds(
    { ...attempt, started_at: dds.sent_at },
    dds.reaction_end_at
      ? Date.parse(dds.reaction_end_at)
      : dds.first_decision_at
        ? Date.parse(dds.first_decision_at)
        : now,
  );
  return {
    highlight,
    setHighlight,
    activity,
    attempt,
    dds,
    completed,
    busy,
    elapsed,
    activeService,
    activeCrew,
    setActiveService,
    setActiveCrew,
    expanded,
    setExpanded,
    collapseAll: () => {
      setExpanded(false);
      setActiveService("");
      setActiveCrew("");
    },
    editing,
    setEditing,
    target,
    crewCode,
    setCrewCode,
    status,
    setStatus,
    number,
    setNumber,
    comment,
    setComment,
    changed,
    openEditor,
    save,
    finish,
    reload,
    error: save.error || finish.error || snapshot.error,
    close: () => {
      if (
        !busy &&
        (!editing ||
          !comment ||
          window.confirm(
            "Закрыть карточку? Несохранённый комментарий будет потерян.",
          ))
      )
        onClose();
    },
  };
}
