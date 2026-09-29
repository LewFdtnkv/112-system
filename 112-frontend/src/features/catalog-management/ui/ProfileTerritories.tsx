import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { Button, Paper, Stack } from "@mui/material";
import { styles } from "../styles/ProfileForm";
import type { ProfileTerritoriesProps } from "../types/ProfileFormSections";

const labels = {
  code: "Код территории",
  name: "Название территории",
  description: "Описание территории",
};

export function ProfileTerritories({
  form,
  onChange,
}: ProfileTerritoriesProps) {
  return (
    <>
      <b>Территории</b>
      {form.territories.map((territory, index) => (
        <Paper key={index} sx={styles.paper}>
          <Stack spacing={1}>
            {(["code", "name", "description"] as const).map((key) => (
              <TextField
                key={key}
                name={`territories.${index}.${key}`}
                required={key !== "description"}
                label={labels[key]}
                value={territory[key]}
                onChange={(event) =>
                  onChange({
                    ...form,
                    territories: form.territories.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, [key]: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            ))}
            <Button
              onClick={() =>
                onChange({
                  ...form,
                  territories: form.territories.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            >
              Удалить территорию
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          onChange({
            ...form,
            territories: [
              ...form.territories,
              {
                code: `area-${form.territories.length + 1}`,
                name: "",
                description: "",
              },
            ],
          })
        }
      >
        Добавить территорию
      </Button>
    </>
  );
}
