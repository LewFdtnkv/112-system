import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { catalogApi } from "@/entities/catalog";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Button, Paper, Stack } from "@mui/material";
import { styles } from "../styles/ProfileForm";
import type { ProfileContactsProps } from "../types/ProfileFormSections";

const labels = {
  code: "Код контакта",
  name: "Название контакта",
  position: "Должность",
  description: "Когда обращаться",
  endpoint_key: "Ключ учебного абонента",
};
const services = async (query: string, signal: AbortSignal) =>
  (await catalogApi.services({ q: query }, signal)).items.map((service) => ({
    id: service.id,
    label: `${service.code} — ${service.name}`,
  }));

export function ProfileContacts({ form, onChange }: ProfileContactsProps) {
  return (
    <>
      <b>Учебные контакты</b>
      {form.contacts.map((contact, index) => (
        <Paper key={index} sx={styles.paper3}>
          <Stack spacing={1}>
            <ServerSelect
              name={`contacts.${index}.target_service_id`}
              required
              label={`Служба контакта ${index + 1}`}
              queryKey={["admin-service-options"]}
              load={services}
              value={
                contact.target_service_id
                  ? {
                      id: contact.target_service_id,
                      label: "Выбранная служба контакта",
                    }
                  : null
              }
              onChange={(service) =>
                onChange({
                  ...form,
                  contacts: form.contacts.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, target_service_id: service?.id ?? "" }
                      : item,
                  ),
                })
              }
            />
            {(
              [
                "code",
                "name",
                "position",
                "description",
                "endpoint_key",
              ] as const
            ).map((key) => (
              <TextField
                key={key}
                name={`contacts.${index}.${key}`}
                required={["code", "name", "endpoint_key"].includes(key)}
                label={labels[key]}
                value={contact[key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    contacts: form.contacts.map((item, itemIndex) =>
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
                  contacts: form.contacts.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            >
              Удалить контакт
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          onChange({
            ...form,
            contacts: [
              ...form.contacts,
              {
                code: `contact-${form.contacts.length + 1}`,
                name: "",
                description: "",
                target_service_id: form.service_id,
                position: null,
                endpoint_key: "",
              },
            ],
          })
        }
      >
        Добавить учебный контакт
      </Button>
      <small>
        Контакты предназначены для локального учебного контура. Телефония
        настраивается администратором.
      </small>
    </>
  );
}
