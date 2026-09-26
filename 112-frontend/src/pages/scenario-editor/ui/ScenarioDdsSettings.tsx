import { serviceProfileApi } from "@/entities/training";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert } from "@mui/material";
import type { ScenarioDdsSettingsProps } from "../types/ScenarioEditorPage";

export function ScenarioDdsSettings({
  form,
  profile,
  onChange,
  onProfileChange,
}: ScenarioDdsSettingsProps) {
  return (
    <>
      <Alert severity="info">
        История, сообщения и учебные цели бригад задаются в каждой карточке
        библиотеки. Выберите карточки для одного профиля службы; здесь задаётся
        только их поступление.
      </Alert>
      <ServerSelect
        name="service_profile_id"
        required
        label="Профиль службы"
        queryKey={["profiles"]}
        value={profile}
        onChange={(next) => {
          onProfileChange(next);
          onChange({
            ...form,
            dds_policy: null,
          });
        }}
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
