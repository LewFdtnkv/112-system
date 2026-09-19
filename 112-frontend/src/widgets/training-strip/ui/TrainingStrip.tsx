import { Button } from "@mui/material";

import { formatDuration } from "@/shared/lib/formatDuration";

export type CallState = "incoming" | "accepted" | "declined";
export type ConnectionState = "connected" | "reconnecting";

interface TrainingStripProps {
  scenarioTitle: string;
  isSessionActive: boolean;
  elapsedSeconds: number;
  normSeconds: number;
  callState: CallState;
  connectionState: ConnectionState;
  onAcceptCall: () => void;
  onDeclineCall: () => void;
  onToggleConnection: () => void;
}

export const TrainingStrip = ({
  scenarioTitle,
  isSessionActive,
  elapsedSeconds,
  normSeconds,
  callState,
  connectionState,
  onAcceptCall,
  onDeclineCall,
  onToggleConnection,
}: TrainingStripProps) => {
  const isOverdue = elapsedSeconds >= normSeconds;

  return (
    <section className="training-strip" aria-label="Статус учебного занятия">
      <div>
        <strong>{scenarioTitle}</strong>
        <span>
          {isSessionActive ? "Занятие активно" : "Демонстрационный режим"}
        </span>
      </div>
      <div
        className={
          isOverdue
            ? "training-strip__timer training-strip__timer--overdue"
            : "training-strip__timer"
        }
      >
        <span>Время</span>
        <strong
          aria-label={
            isOverdue ? "Норматив превышен" : "Время заполнения карточки"
          }
        >
          {formatDuration(elapsedSeconds)} / {formatDuration(normSeconds)}
        </strong>
      </div>
      <div>
        <span>Соединение</span>
        <Button
          className={`training-strip__connection training-strip__connection--${connectionState}`}
          onClick={onToggleConnection}
        >
          {connectionState === "connected" ? "Подключено" : "Переподключение"}
        </Button>
      </div>
      <div className="training-strip__call">
        <span>Учебный вызов</span>
        {callState === "incoming" && (
          <>
            <Button variant="contained" onClick={onAcceptCall}>
              Принять
            </Button>
            <Button onClick={onDeclineCall}>Отклонить</Button>
          </>
        )}
        {callState === "accepted" && <strong>Вызов принят</strong>}
        {callState === "declined" && <strong>Вызов отклонён</strong>}
      </div>
    </section>
  );
};
