import { ArmIconButton } from "@/shared/ui/arm";
import type { CardServiceHistoryProps } from "../types/CardServiceHistory";

export function CardServiceHistory({
  serviceId,
  serviceName,
  submitted,
  onClose,
}: CardServiceHistoryProps) {
  return (
    <section
      className="arm-service-history"
      aria-label={`История службы ${serviceId}`}
    >
      <h3>
        {serviceName ?? `Служба ${serviceId}`}
        <ArmIconButton
          icon="close"
          label="Закрыть историю службы"
          onClick={onClose}
        />
      </h3>
      <p>
        Статус:{" "}
        {submitted ? "Передана на учебную проверку" : "Выбрана для оповещения"}
      </p>
      <p>
        {submitted
          ? "Учебная карточка сохранена."
          : "Служба будет включена в учебное оповещение при сохранении карточки."}
      </p>
    </section>
  );
}
