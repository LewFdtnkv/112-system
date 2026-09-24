import { ArmIconButton } from "@/shared/ui/arm";
import type { CardServiceTilesProps } from "../types/CardServiceTiles";
import { CardServiceTile } from "./CardServiceTile";
export function CardServiceTiles({
  editor,
  submitted,
  viewing,
  activeService,
  onActiveServiceChange,
  servicesOpen,
  onServicesToggle,
  locked,
}: CardServiceTilesProps) {
  const { fields } = editor;
  return (
    <div className="arm-service-tiles" data-learning-target="notification">
      <strong>Службы:</strong>
      {editor.remote.notificationRequired === false && (
        <span>Оповещение не требуется</span>
      )}
      {fields.services.map((service) => {
        const info = editor.remote.services.find((item) => item.id === service);
        return (
          <CardServiceTile
            key={service}
            name={info?.name ?? `Служба ${service}`}
            shortName={info?.short_name}
            status={submitted ? "Учебная проверка" : "К оповещению"}
            expanded={activeService === service}
            onClick={() =>
              onActiveServiceChange(
                activeService === service ? undefined : service,
              )
            }
          />
        );
      })}
      {!viewing && editor.remote.loadServices && (
        <ArmIconButton
          icon="plus"
          label="Добавить службы"
          disabled={locked("notification")}
          aria-expanded={servicesOpen}
          onClick={onServicesToggle}
        />
      )}
    </div>
  );
}
