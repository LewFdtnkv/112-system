import { catalogKeys, serviceProfileApi } from "@/entities/catalog";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert } from "@mui/material";
import type { ScenarioDdsSettingsProps } from "../types/ScenarioEditorPage";

export function ScenarioDdsSettings({
  profile,
  onProfileChange,
}: ScenarioDdsSettingsProps) {
  return (
    <>
      <Alert severity="info">
        Сначала выберите профиль службы. Затем появятся настройки сценария и
        карточки, подготовленные для этого профиля. История и учебные цели
        бригад задаются в карточках, а здесь — порядок и время их поступления.
      </Alert>
      <ServerSelect
        name="service_profile_id"
        required
        label="Профиль службы"
        queryKey={catalogKeys.profiles}
        value={profile}
        onChange={onProfileChange}
        load={async (query, signal) =>
          (await serviceProfileApi.list(query, signal)).map((profile) => ({
            id: profile.id,
            label: profile.name,
          }))
        }
      />
    </>
  );
}
