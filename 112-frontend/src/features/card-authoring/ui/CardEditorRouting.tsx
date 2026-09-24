import { cardApi, type FeatureDefinition } from "@/entities/training";
import { getApiError } from "@/shared/api";
import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert, Button, TextField } from "@mui/material";
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
    setAnswers,
    setEntry,
    setFeatures,
    setManualRecipients,
    setNotificationRequired,
    setOptional,
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
        label="Количество пострадавших"
        type="number"
        value={victims}
        onChange={(event) => setVictims(event.target.value)}
        slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }}
        helperText="Оставьте пустым, если в условии не указано. Ноль означает, что пострадавших нет."
      />
      <ServerSelect
        label="Опубликованная версия ЕКП"
        queryKey={["classifier-options"]}
        value={version}
        onChange={(value) => {
          setVersion(value);
          setEntry(null);
          setNotificationRequired(true);
          setFeatures([]);
          setAnswers({});
          setOptional([]);
          setManualRecipients(null);
        }}
        load={async (query, signal) =>
          (await cardApi.classifiers(query, signal)).map((classifier) => ({
            id: classifier.id,
            label: classifier.label,
          }))
        }
      />
      <ServerSelect
        label="Тип происшествия (ЕКП)"
        queryKey={["entry-options-with-features", version?.id]}
        disabled={!version || silent}
        value={editor.entry}
        onChange={(value) => {
          setEntry(value);
          const metadata = value?.metadata as
            | {
                features?: FeatureDefinition[];
                notification_required?: boolean;
              }
            | undefined;
          setFeatures(metadata?.features ?? []);
          setNotificationRequired(metadata?.notification_required !== false);
          setAnswers({});
          setOptional([]);
          setManualRecipients(null);
        }}
        load={async (query, signal) => {
          const rows = await cardApi.entries(version!.id, { q: query }, signal);
          return rows.map((entry) => ({
            id: entry.id,
            label: `${entry.code} — ${entry.name}`,
            metadata: {
              features: entry.conditions.features ?? [],
              notification_required: entry.notification_required,
            },
          }));
        }}
      />
      {!silent &&
        activeFeatureDefinitions(features, answers).map((feature) => (
          <FeatureInput
            key={feature.key}
            feature={feature}
            value={answers[feature.key]}
            onChange={(value) =>
              setAnswers(
                updateFeatureAnswer(features, answers, feature.key, value),
              )
            }
          />
        ))}
      <CardEditorRecipients editor={editor} initial={initial} />
      {save.error && (
        <Alert
          severity="error"
          action={
            initial && onReload ? (
              <Button onClick={onReload}>Загрузить актуальную карточку</Button>
            ) : undefined
          }
        >
          {getApiError(save.error).message}
        </Alert>
      )}
    </>
  );
}
