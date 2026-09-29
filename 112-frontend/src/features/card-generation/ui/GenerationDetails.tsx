import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { cardFlagFields } from "@/entities/incident-card";
import { MenuItem } from "@mui/material";
import { GenerationTextChoice } from "./GenerationTextChoice";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";
import { GenerationAddress } from "./GenerationAddress";

export function GenerationDetails({ model }: CardGenerationPanelProps) {
  const data = model.options.data!;
  return (
    <>
      <h3>Отметки карточки</h3>
      <p>Выбранные отметки войдут в условие и эталонное решение.</p>
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
      <GenerationAddress model={model} />
      <h3>Заявитель и подача сообщения</h3>
      <p>
        Имя выбирается случайно. Можно указать своё ФИО или имя и фамилию;
        пол в этом случае задайте отдельно, если он известен.
      </p>
      <div className="generation-grid">
        {(
          [
            ["message_format", "Формат сообщения"],
            ["caller_information", "Сведения о заявителе"],
            ["gender", "Пол заявителя"],
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
