import { catalogLookupApi } from "@/entities/catalog";
import {
  ValidationField,
  ValidatedTextField as TextField,
} from "@/shared/ui/form-validation";
import { activeFeatureDefinitions } from "@/shared/lib/featureValues";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Button } from "@mui/material";
import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { CardEditorRecipients } from "./CardEditorRecipients";

export function CardEditorRouting({
  editor,
  initial,
  onReload,
}: CardEditorPanelProps) {
  const {
    answers,
    features,
    save,
    setAnswer,
    setEntry,
    setVersion,
    setVictims,
    silent,
    version,
    victims,
  } = editor;
  return (
    <>
      <h4>Происшествие и службы</h4>
      <TextField
        disabled={silent}
        name="data.features.victimsCount"
        label="Количество пострадавших"
        type="number"
        value={victims}
        onChange={(event) => setVictims(event.target.value)}
        slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }}
        helperText="Оставьте пустым, если в условии не указано. Ноль означает, что пострадавших нет."
      />
      <ServerSelect
        name="classifier_version_id"
        required
        label="Опубликованная версия ЕКП"
        queryKey={["classifier-options"]}
        value={version}
        onChange={setVersion}
        load={async (query, signal) =>
          (await catalogLookupApi.classifiers(query, signal)).map(
            (classifier) => ({
              id: classifier.id,
              label: classifier.label,
            }),
          )
        }
      />
      <ServerSelect
        name="classifier_entry_id"
        required={!silent}
        label="Тип происшествия (ЕКП)"
        queryKey={["entry-options-with-features", version?.id]}
        disabled={!version || silent}
        value={editor.entry}
        onChange={setEntry}
        load={async (query, signal) => {
          const rows = await catalogLookupApi.entries(
            version!.id,
            { q: query },
            signal,
          );
          return rows.map((entry) => ({
            id: entry.id,
            label: entry.display_name || entry.name,
            metadata: {
              features: entry.conditions.features ?? [],
              notification_required: entry.notification_required,
            },
          }));
        }}
      />
      <ValidationField name="data.features.ekp" label="Признаки происшествия">
        {!silent &&
          activeFeatureDefinitions(features, answers).map((feature) => (
            <FeatureInput
              key={feature.key}
              feature={feature}
              value={answers[feature.key]}
              onChange={(value) => setAnswer(feature.key, value)}
            />
          ))}
      </ValidationField>
      <CardEditorRecipients editor={editor} initial={initial} />
      {save.error && initial && onReload && (
        <Button onClick={onReload}>Загрузить актуальную карточку</Button>
      )}
    </>
  );
}
