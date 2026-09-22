import { trainingApi, type Attempt } from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DDSWorkspaceProps } from "../types/DDSWorkspace";

export function useDDSWorkspace({
  initial,
  onSaved,
  onClose,
}: DDSWorkspaceProps) {
  const [attempt, setAttempt] = useState(initial);
  const [activeService, setActiveService] = useState("");
  const [activeCrew, setActiveCrew] = useState("");
  const [serviceHistory, setServiceHistory] = useState(false);
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
    setAttempt(value);
    setEditing(false);
    setComment("");
    setRequestId(randomUUID());
    onSaved();
  };
  const save = useMutation({
    mutationFn: () => {
      const data = {
        request_id: requestId,
        revision: dds.revision,
        information_event_id: dds.information!.id,
        status,
        crew_number: number.trim() || null,
        comment,
      };
      return target === "service"
        ? trainingApi.ddsAction(attempt.id, data)
        : trainingApi.ddsCrew(attempt.id, { ...data, crew_code: crewCode });
    },
    onSuccess: (value) => {
      if (target === "crew") {
        setActiveService(dds.profile.service_id);
        setActiveCrew(
          dds.crews?.some((c) => c.crew_code === crewCode) ? crewCode : "",
        );
        setServiceHistory(false);
      }
      update(value);
    },
  });
  const finish = useMutation({
    mutationFn: () => trainingApi.ddsSubmit(attempt.id, dds.revision),
    onSuccess: update,
  });
  const reload = useMutation({
    mutationFn: () => trainingApi.attempt(attempt.id),
    onSuccess: update,
  });
  const busy = save.isPending || finish.isPending || reload.isPending;
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
  const changed = () => setRequestId(randomUUID());
  const elapsed = Math.max(
    0,
    Math.floor(
      ((dds.first_decision_at ? Date.parse(dds.first_decision_at) : now) -
        Date.parse(dds.sent_at)) /
        1000,
    ),
  );
  return {
    attempt,
    dds,
    completed,
    busy,
    elapsed,
    activeService,
    activeCrew,
    setActiveService,
    setActiveCrew,
    serviceHistory,
    setServiceHistory,
    expanded,
    setExpanded,
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
    error: save.error || finish.error || reload.error,
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
