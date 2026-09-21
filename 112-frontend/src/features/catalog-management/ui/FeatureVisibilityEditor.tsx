import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import type { FeatureVisibilityEditorProps } from "../types/visibility";

export function FeatureVisibilityEditor({
  feature,
  parents,
  onChange,
}: FeatureVisibilityEditorProps) {
  const rules = feature.visible_when ?? [];
  if (!parents.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        Когда показывать «{feature.label}»
      </Typography>
      {!rules.length && <Typography variant="body2">Всегда</Typography>}
      {rules.map((group, index) => (
        <Paper variant="outlined" key={index}>
          <Stack spacing={1}>
            <Typography variant="body2">
              Вариант {index + 1}: все выбранные условия одновременно
            </Typography>
            {!Object.keys(group).length && (
              <Alert severity="warning">
                Выберите хотя бы одно условие или удалите вариант.
              </Alert>
            )}
            {parents
              .filter((p) => p.key)
              .map((parent) => (
                <FeatureInput
                  key={parent.key}
                  feature={parent}
                  value={group[parent.key]}
                  condition
                  onChange={(value) => {
                    const next = { ...group };
                    if (
                      value === undefined ||
                      (Array.isArray(value) && !value.length)
                    )
                      delete next[parent.key];
                    else next[parent.key] = value;
                    onChange(rules.map((r, i) => (i === index ? next : r)));
                  }}
                />
              ))}
            <Button
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
            >
              Удалить вариант {index + 1}
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() => onChange([...rules, {}])}
        disabled={rules.length >= 20}
      >
        {rules.length
          ? "Добавить альтернативу (ИЛИ)"
          : "Добавить условие показа"}
      </Button>
    </Stack>
  );
}
