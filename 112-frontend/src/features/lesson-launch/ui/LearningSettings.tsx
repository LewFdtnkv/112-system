import {
  assistanceLabels,
  learningSkillLabels,
  lessonKindDescriptions,
  lessonKindLabels,
  noAssistance,
} from "@/entities/training";
import type {
  AssistancePolicy,
  LearningSkill,
  LessonKind,
} from "@/entities/training";
import {
  Alert,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  TextField,
} from "@mui/material";
import type { LearningSettingsProps } from "../types/LearningSettings";
import "../styles/learning-settings.scss";

export function LearningSettings({
  value,
  onChange,
  role,
}: LearningSettingsProps) {
  const setAssistance = (patch: Partial<AssistancePolicy>) =>
    onChange({ ...value, assistance: { ...value.assistance, ...patch } });
  return (
    <section
      className="learning-settings"
      aria-labelledby="learning-settings-title"
    >
      <h3 id="learning-settings-title">Цель и формат занятия</h3>
      <p>
        Учебная роль определяется сценарием. Здесь выберите, чему посвящено
        занятие и какая помощь предусмотрена.
      </p>
      <div
        className="learning-kind-options"
        role="group"
        aria-label="Вид занятия"
      >
        {(Object.keys(lessonKindLabels) as LessonKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={kind === "introduction" || kind === "worked_example"}
            aria-pressed={value.kind === kind}
            onClick={() =>
              onChange({
                ...value,
                kind,
                assistance:
                  kind === "assessment" ? noAssistance() : value.assistance,
              })
            }
          >
            <strong>{lessonKindLabels[kind]}</strong>
            <span>{lessonKindDescriptions[kind]}</span>
          </button>
        ))}
      </div>
      <div className="learning-settings-fields">
        <TextField
          label="Учебная цель"
          multiline
          minRows={2}
          value={value.objective}
          onChange={(e) => onChange({ ...value, objective: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
          helperText="Видна ученику. Например: точно указывать адрес и выбирать нужные службы."
        />
        <div>
          <p>
            Целевые навыки
            {["skill_practice", "review"].includes(value.kind)
              ? " · выберите хотя бы один"
              : " · необязательно"}
          </p>
          <div
            className="learning-skill-options"
            role="group"
            aria-label="Целевые навыки"
          >
            {(Object.keys(learningSkillLabels) as LearningSkill[])
              .filter(
                (skill) =>
                  skill === "interface" ||
                  !role ||
                  (role === "dds"
                    ? skill.startsWith("dds_")
                    : !skill.startsWith("dds_")),
              )
              .map((skill) => (
                <Chip
                  key={skill}
                  label={learningSkillLabels[skill]}
                  clickable
                  color={
                    value.target_skills.includes(skill) ? "primary" : "default"
                  }
                  variant={
                    value.target_skills.includes(skill) ? "filled" : "outlined"
                  }
                  aria-pressed={value.target_skills.includes(skill)}
                  onClick={() =>
                    onChange({
                      ...value,
                      target_skills: value.target_skills.includes(skill)
                        ? value.target_skills.filter((s) => s !== skill)
                        : [...value.target_skills, skill],
                    })
                  }
                />
              ))}
          </div>
          <small>
            Навыки задают фокус занятия. Сейчас проверяется вся карточка по
            критериям сценария.
          </small>
        </div>
        <TextField
          select
          label="Учебная помощь"
          value={value.assistance.mode}
          disabled={value.kind === "assessment"}
          onChange={(e) => {
            const mode = e.target.value as AssistancePolicy["mode"];
            onChange({
              ...value,
              assistance:
                mode === "none"
                  ? noAssistance()
                  : { ...value.assistance, mode, on_request: true },
            });
          }}
        >
          {Object.entries(assistanceLabels).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {value.kind === "assessment" && (
          <Alert severity="info">
            Контрольное занятие проходит без учебных подсказок. Его результат
            учитывается отдельно от тренировок.
          </Alert>
        )}
        {value.assistance.mode !== "none" && (
          <>
            <Alert severity="info">
              Настройки помощи сохраняются для дальнейшего обучения. Выдача
              подсказок пока недоступна; сейчас ученик выполняет задание
              самостоятельно.
            </Alert>
            <div className="learning-help-options">
              <TextField
                select
                label="Максимальная помощь"
                value={value.assistance.max_level}
                onChange={(e) =>
                  setAssistance({
                    max_level: e.target.value as AssistancePolicy["max_level"],
                  })
                }
              >
                <MenuItem value="goal">Напомнить цель</MenuItem>
                <MenuItem value="explanation">Объяснить действие</MenuItem>
                <MenuItem value="solution">Показать решение</MenuItem>
              </TextField>
              <TextField
                label="Пауза перед предложением помощи, с"
                type="number"
                value={value.assistance.idle_seconds ?? ""}
                onChange={(e) =>
                  setAssistance({
                    idle_seconds: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                slotProps={{ htmlInput: { min: 10, max: 3600 } }}
                helperText="Пусто — помощь только по запросу. Пауза сама по себе не считается ошибкой."
              />
            </div>
            <FormControlLabel
              label="Разрешить запрос помощи учеником"
              control={
                <Checkbox
                  checked={value.assistance.on_request}
                  onChange={(_, checked) =>
                    setAssistance({ on_request: checked })
                  }
                />
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
