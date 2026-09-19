import { Button } from "@mui/material";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  clearCardDraft,
  demoIncidents,
  emptyCardFields,
  type IncidentCard,
  type IncidentCardFields,
} from "@/entities/incident-card";
import { useDemoScenarioStore } from "@/entities/scenario";
import {
  clearWorkspaceSnapshot,
  useDemoTrainingStore,
  readWorkspaceSnapshot,
  writeWorkspaceSnapshot,
  type DemoTrainingSession,
} from "@/entities/training-session";
import { useAuthStore } from "@/entities/user";
import { getTrainingResultPath, routePaths } from "@/shared/config/routes";
import { EmptyState } from "@/shared/ui/EmptyState";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { LocationMap } from "@/widgets/location-map-placeholder";
import { ArmIconButton } from "@/shared/ui/arm";
import { IncidentFeed } from "@/widgets/incident-feed";
import {
  TrainingStrip,
  type CallState,
  type ConnectionState,
} from "@/widgets/training-strip";

const fallbackNormSeconds = 30;

const nextCardId = (count: number) =>
  `379${String(count + 1).padStart(6, "0")}`;

const currentTime = () =>
  new Date().toLocaleTimeString("ru-RU", { hour12: false });

export const TrainingWorkspacePage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const userId = useAuthStore((state) => state.session?.userId);
  const sessions = useDemoTrainingStore((state) => state.sessions);
  const session = sessions.find(
    (item) => item.id === sessionId && item.studentId === userId,
  );

  if (!session) {
    return (
      <EmptyState
        title="Занятие не найдено"
        action={<Link to={routePaths.studentDashboard}>К моим занятиям</Link>}
      />
    );
  }

  if (session.status === "completed") {
    return (
      <EmptyState
        title="Занятие завершено"
        action={
          <Link to={getTrainingResultPath(session.id)}>Открыть результат</Link>
        }
      />
    );
  }

  return <TrainingWorkspace key={session.id} session={session} />;
};

const TrainingWorkspace = ({ session }: { session: DemoTrainingSession }) => {
  const navigate = useNavigate();
  const sessionId = session.id;
  const startSession = useDemoTrainingStore((state) => state.startSession);
  const completeSession = useDemoTrainingStore(
    (state) => state.completeSession,
  );
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const scenario = scenarios.find((item) => item.id === session?.scenarioId);
  const normSeconds = scenario?.normSeconds ?? fallbackNormSeconds;

  const [initialWorkspace] = useState(() =>
    readWorkspaceSnapshot(sessionId, {
      incidents: demoIncidents,
      logs: {},
      submittedIds: [],
      callState: "incoming",
      connectionState: "connected",
      elapsedSeconds: 0,
    }),
  );
  const [incidents, setIncidents] = useState<readonly IncidentCard[]>(
    initialWorkspace.incidents,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [activeCard, setActiveCard] = useState<IncidentCard | null>(null);
  const [logs, setLogs] = useState<Record<string, readonly string[]>>(
    initialWorkspace.logs,
  );
  const [submittedIds, setSubmittedIds] = useState<readonly string[]>(
    initialWorkspace.submittedIds,
  );
  const [callState, setCallState] = useState<CallState>(
    initialWorkspace.callState,
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    initialWorkspace.connectionState,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(
    initialWorkspace.elapsedSeconds,
  );

  useEffect(() => {
    if (callState !== "accepted") return;

    const intervalId = window.setInterval(
      () => setElapsedSeconds((current) => current + 1),
      1000,
    );

    return () => window.clearInterval(intervalId);
  }, [callState]);

  useEffect(() => {
    writeWorkspaceSnapshot(sessionId, {
      incidents,
      logs,
      submittedIds,
      callState,
      connectionState,
      elapsedSeconds,
    });
  }, [
    callState,
    connectionState,
    elapsedSeconds,
    incidents,
    logs,
    sessionId,
    submittedIds,
  ]);

  const appendLog = (cardId: string, entry: string) =>
    setLogs((current) => ({
      ...current,
      [cardId]: [...(current[cardId] ?? []), entry],
    }));

  const applyFields = (cardId: string, fields: IncidentCardFields) =>
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === cardId ? { ...incident, fields } : incident,
      ),
    );

  const openCard = (card: IncidentCard) => {
    setSelectedId(card.id);
    setActiveCard(card);
  };

  const createCard = () => {
    const card: IncidentCard = {
      id: nextCardId(incidents.length),
      createdAt: currentTime(),
      channel: "112",
      origin: "student",
      createdDate: new Date().toLocaleDateString("ru-RU"),
      operatorNumber: "0",
      workstation: "4",
      fields: {
        ...emptyCardFields,
        address: {
          ...emptyCardFields.address,
          region: "Москва",
          country: "",
        },
      },
    };

    setIncidents((current) => [card, ...current]);
    openCard(card);
  };

  const commitAction = (fields: IncidentCardFields, action: string) => {
    if (!activeCard || submittedIds.includes(activeCard.id)) return;

    applyFields(activeCard.id, { ...fields, operatorAction: "" });
    appendLog(activeCard.id, `Оператор: ${action}`);
  };

  const submitCard = (fields: IncidentCardFields) => {
    if (!activeCard || submittedIds.includes(activeCard.id)) return;

    const closed: IncidentCardFields = { ...fields, status: "closed" };
    applyFields(activeCard.id, closed);
    setActiveCard({ ...activeCard, fields: closed });
    appendLog(activeCard.id, "Карточка отправлена на учебную проверку.");
    setSubmittedIds((current) => [...current, activeCard.id]);
    clearCardDraft(sessionId, activeCard.id);
  };

  const completeTraining = () => {
    const submittedId = submittedIds.at(-1);
    const submittedCard = incidents.find((item) => item.id === submittedId);
    if (!submittedCard) return;

    const result = completeSession({
      sessionId,
      fields: submittedCard.fields,
      actionLog: logs[submittedCard.id] ?? [],
      elapsedSeconds,
      normSeconds,
    });
    if (result) {
      clearWorkspaceSnapshot(sessionId);
      navigate(getTrainingResultPath(sessionId));
    }
  };

  return (
    <div className="incident-desk">
      <TrainingStrip
        scenarioTitle={scenario?.name ?? "Учебное занятие"}
        isSessionActive={Boolean(session)}
        elapsedSeconds={elapsedSeconds}
        normSeconds={normSeconds}
        callState={callState}
        connectionState={connectionState}
        onAcceptCall={() => {
          startSession(sessionId);
          setCallState("accepted");
        }}
        onDeclineCall={() => setCallState("declined")}
        onToggleConnection={() =>
          setConnectionState((current) =>
            current === "connected" ? "reconnecting" : "connected",
          )
        }
      />

      <IncidentFeed
        toolbar={
          <div className="arm-journal-actions">
            <ArmIconButton
              icon="plus"
              label="Создать новую карточку"
              disabled={callState !== "accepted"}
              onClick={createCard}
            />
            <Link to={routePaths.studentDashboard}>Мои занятия</Link>
            <Button
              disabled={callState !== "accepted" || submittedIds.length === 0}
              onClick={completeTraining}
            >
              Завершить занятие
            </Button>
          </div>
        }
        incidents={incidents}
        selectedId={selectedId}
        onOpen={openCard}
      />

      <IncidentCardDialog
        renderMap={(addressLine) => <LocationMap addressLine={addressLine} />}
        card={activeCard}
        sessionId={sessionId}
        log={logs[activeCard?.id ?? ""] ?? []}
        isSubmitted={activeCard ? submittedIds.includes(activeCard.id) : false}
        isCallAccepted={callState === "accepted"}
        onClose={() => setActiveCard(null)}
        onCommitAction={commitAction}
        onSubmit={submitCard}
        elapsedSeconds={elapsedSeconds}
        normSeconds={normSeconds}
      />
    </div>
  );
};
