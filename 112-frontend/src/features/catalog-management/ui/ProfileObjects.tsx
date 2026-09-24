import { Button, Paper, Stack, TextField } from "@mui/material";
import { styles } from "../styles/ProfileForm";
import type { ProfileObjectsProps } from "../types/ProfileFormSections";

const labels = {
  code: "Код объекта",
  name: "Название объекта",
  territory_code: "Код территории объекта",
  address: "Адрес объекта",
  responsibility: "Ответственность по объекту",
};

export function ProfileObjects({ form, onChange }: ProfileObjectsProps) {
  return (
    <>
      <b>Объекты</b>
      {form.objects.map((object, index) => (
        <Paper key={index} sx={styles.paper2}>
          <Stack spacing={1}>
            {(
              [
                "code",
                "name",
                "territory_code",
                "address",
                "responsibility",
              ] as const
            ).map((key) => (
              <TextField
                key={key}
                required={key !== "territory_code"}
                label={labels[key]}
                value={object[key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    objects: form.objects.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            [key]:
                              key === "territory_code"
                                ? event.target.value || null
                                : event.target.value,
                          }
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
                  objects: form.objects.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            >
              Удалить объект
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          onChange({
            ...form,
            objects: [
              ...form.objects,
              {
                code: `object-${form.objects.length + 1}`,
                name: "",
                territory_code: null,
                address: "",
                responsibility: "",
              },
            ],
          })
        }
      >
        Добавить объект
      </Button>
    </>
  );
}
