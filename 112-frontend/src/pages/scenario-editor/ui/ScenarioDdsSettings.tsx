import { serviceProfileApi } from "@/entities/training";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert } from "@mui/material";
import type { ScenarioDdsSettingsProps } from "../types/ScenarioEditorPage";
import { DDSPolicyFields } from "./DDSPolicyFields";

export function ScenarioDdsSettings({
  form,
  profile,
  onChange,
  onProfileChange,
}: ScenarioDdsSettingsProps) {
  return (
    <>
      <Alert severity="warning">
        Выберите опубликованный профиль и задайте сообщения и ожидаемые действия
        ДДС. Аудио звонков подготовьте в разделе «Записи звонков».
      </Alert>
      <DDSPolicyFields
        profileId={profile?.id}
        value={form.dds_policy!}
        onChange={(dds_policy) => onChange({ ...form, dds_policy })}
      />
      <ServerSelect
        label="Профиль службы"
        queryKey={["profiles"]}
        value={profile}
        onChange={(next) => {
          onProfileChange(next);
          onChange({
            ...form,
            dds_policy: { ...form.dds_policy!, required_crews: [] },
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
