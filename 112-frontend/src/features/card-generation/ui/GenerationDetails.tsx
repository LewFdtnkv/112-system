import { cardFlagFields } from "@/entities/incident-card";
import { MenuItem, TextField } from "@mui/material";
import { GenerationTextChoice } from "./GenerationTextChoice";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";

export function GenerationDetails({ model }: CardGenerationPanelProps) {
  const data = model.options.data!;
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
          label="Количество пострадавших"
          type="number"
          value={model.p.victims_count ?? ""}
          placeholder="Случайно"
          helperText="Пусто — случайно; 0 — пострадавших нет"
          slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }}
          onChange={(e) =>
            model.change({
              victims_count:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </div>
      <h3>Место происшествия</h3>
      <TextField
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
          values={data.locality}
        />
        <GenerationTextChoice
          model={model}
          name="street"
          label="Улица"
          values={data.street}
        />
        <GenerationTextChoice
          model={model}
          name="house"
          label="Дом"
          values={data.house}
        />
        <GenerationTextChoice
          model={model}
          name="object"
          label="Объект"
          values={data.object}
        />
      </div>
      <TextField
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
          values={
            model.p.gender
              ? data.caller_name[model.p.gender]
              : Object.values(data.caller_name).flat()
          }
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
