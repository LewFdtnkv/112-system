import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { cardFlagFields } from "@/entities/incident-card";
import { Link, MenuItem } from "@mui/material";
import { GenerationTextChoice } from "./GenerationTextChoice";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";
import { addressChoices } from "../lib/catalogChoices";

export function GenerationDetails({ model }: CardGenerationPanelProps) {
  const data = model.options.data!;
  const addresses = addressChoices(data, model.p);
  return (
    <>
      <h3>Отметки карточки</h3>
      <p>Значения выбираются до обращения к ИИ и входят в эталонное решение.</p>
      <div className="generation-grid">
        {cardFlagFields.map(({ parameter, label }) => {
          if (parameter === "no_contact" || parameter === "call_dropped")
            return null;
          return (
            <TextField
              name={`parameters.${parameter}`}
              key={parameter}
              select
              label={label}
              value={
                model.p[parameter] == null
                  ? "random"
                  : String(model.p[parameter])
              }
              onChange={(e) =>
                model.change({
                  [parameter]:
                    e.target.value === "random"
                      ? null
                      : e.target.value === "true",
                })
              }
            >
              <MenuItem value="random">Случайно</MenuItem>
              <MenuItem value="true">Да</MenuItem>
              <MenuItem value="false">Нет</MenuItem>
            </TextField>
          );
        })}
        <TextField
          name="parameters.victims_count"
          label="Количество пострадавших"
          type="number"
          value={model.p.victims_count ?? ""}
          placeholder="Случайно"
          helperText={`Пусто — случайно; 0 — пострадавших нет. В заготовках максимум ${data.max_victims_count}; для отдельных сюжетов меньше.`}
          slotProps={{
            htmlInput: { min: 0, max: data.max_victims_count, step: 1 },
          }}
          onChange={(e) =>
            model.change({
              victims_count:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </div>
      <h3>Место происшествия</h3>
      <p>
        Случайный адрес выбирается целиком из {data.addresses.length} московских
        адресов. Для своего адреса укажите улицу и дом или ориентир. Адресные
        данные:{" "}
        <Link
          href={data.address_source.source_url}
          target="_blank"
          rel="noreferrer"
        >
          {data.address_source.source} ({data.address_source.license})
        </Link>
        .
      </p>
      <TextField
        name="parameters.address_format"
        select
        label="Формат адреса"
        value={model.p.address_format ?? "random"}
        onChange={(e) =>
          model.change({
            address_format:
              e.target.value === "random"
                ? null
                : (e.target.value as "structured" | "descriptive"),
          })
        }
      >
        <MenuItem value="random">Случайно</MenuItem>
        {data.address_format.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <div className="generation-grid">
        <GenerationTextChoice
          model={model}
          name="locality"
          label="Населённый пункт"
          values={addresses.locality}
        />
        <GenerationTextChoice
          model={model}
          name="street"
          label="Улица"
          values={addresses.street}
        />
        <GenerationTextChoice
          model={model}
          name="house"
          label="Дом"
          values={addresses.house}
        />
        <GenerationTextChoice
          model={model}
          name="object"
          label="Объект"
          values={data.object}
        />
      </div>
      <TextField
        name="parameters.address_description"
        label="Описательный адрес — ориентиры"
        multiline
        minRows={2}
        value={model.p.address_description ?? ""}
        disabled={model.p.address_format === "structured" || !!model.p.house}
        placeholder="Случайный ориентир из заготовок"
        helperText="Например: за остановкой, рядом с зелёным ограждением. Номер дома не выдумывается."
        onChange={(e) =>
          model.change({ address_description: e.target.value || null })
        }
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <h3>Заявитель и подача сообщения</h3>
      <p>
        Имя и фамилия выбираются случайно с учётом пола. Отчество добавляется в{" "}
        {Math.round(data.patronymic_probability * 100)}% случаев. Можно указать
        своё ФИО или ФИ; пол в этом случае задайте отдельно, если он известен.
      </p>
      <div className="generation-grid">
        {(
          [
            ["message_format", "Формат сообщения"],
            ["caller_information", "Сведения о заявителе"],
            ["gender", "Пол заявителя"],
            ["time_of_day", "Время суток"],
            ["caller_state", "Состояние заявителя"],
            ["detail_level", "Подробность сообщения"],
          ] as const
        ).map(([key, title]) => (
          <TextField
            name={`parameters.${key}`}
            key={key}
            select
            label={title}
            disabled={
              key === "gender" &&
              (model.p.caller_information === "anonymous" ||
                model.p.caller_information === "name_only")
            }
            value={model.p[key] ?? "random"}
            onChange={(e) =>
              model.change({
                [key]: e.target.value === "random" ? null : e.target.value,
              })
            }
          >
            <MenuItem value="random">Случайно</MenuItem>
            {data[key].map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        ))}
        <TextField
          name="parameters.age"
          label="Возраст заявителя"
          disabled={
            model.p.caller_information === "anonymous" ||
            model.p.caller_information === "name_only"
          }
          type="number"
          value={model.p.age ?? ""}
          placeholder="Случайно"
          helperText="Пусто — случайно; от 8 до 95 лет"
          onChange={(e) =>
            model.change({
              age: e.target.value ? Number(e.target.value) : null,
            })
          }
          slotProps={{ htmlInput: { min: 8, max: 95 } }}
        />
        <GenerationTextChoice
          model={model}
          name="caller_name"
          label="ФИО заявителя"
          values={[]}
        />
      </div>
      <p>
        СМС по умолчанию не содержит ФИО, пола, возраста и телефона. Для
        телефонного сообщения номер АОН вымышленный учебный. Неизвестные
        сведения не входят в эталонное решение.
      </p>
    </>
  );
}
