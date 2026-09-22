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
import { Alert, Chip, MenuItem, TextField } from "@mui/material";
import type { LearningSettingsProps } from "../types/LearningSettings";
import "../styles/learning-settings.scss";

export function LearningSettings({
  value,
  onChange,
  role,
}: LearningSettingsProps) {
  const focused = value.kind === "skill_practice" || value.kind === "review";
  return (
    <section
      className="learning-settings"
      aria-labelledby="learning-settings-title"
    >
      <h3 id="learning-settings-title">Цель и формат занятия</h3>
      <p>
        Учебная роль определяется сценарием. Выберите формат и допустимую
        глубину помощи.
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
                target_skills: ["skill_practice", "review"].includes(kind)
                  ? value.target_skills
                  : [],
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
          helperText="Видна ученику. Опишите результат работы, не раскрывая ответ."
        />
        {focused && (
          <>
            <p>Целевые навыки · выберите хотя бы один</p>
            <div
              className="learning-skill-options"
              role="group"
              aria-label="Целевые навыки"
            >
              {(Object.keys(learningSkillLabels) as LearningSkill[])
                .filter(
                  (skill) =>
                    skill !== "interface" &&
                    (!role ||
                      (role === "dds"
                        ? skill.startsWith("dds_")
                        : !skill.startsWith("dds_"))),
                )
                .map((skill) => (
                  <Chip
                    key={skill}
                    label={learningSkillLabels[skill]}
                    clickable
                    color={
                      value.target_skills.includes(skill)
                        ? "primary"
                        : "default"
                    }
                    variant={
                      value.target_skills.includes(skill)
                        ? "filled"
                        : "outlined"
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
            <Alert severity="info">
              Выбранные элементы ученик выполняет сам. Остальные поля
              подготовлены и защищены от изменений; они не входят в оценку.
              Сценарий проверяется на совместимость перед назначением.
            </Alert>
            {value.target_skills.includes("notification") && (
              <p>
                Службы для оповещения ученик выбирает сам: исходный список будет
                пустым.
              </p>
            )}
            {value.target_skills.includes("address") && (
              <p>
                Структурированный адрес проверяется по отдельным полям. Если в
                карточке задан только текстовый адрес, автоматически проверяется
                его наличие; смысл требует проверки преподавателя.
              </p>
            )}
            {value.target_skills.includes("description") && (
              <p>
                Для свободного описания автоматически проверяется только наличие
                текста. Смысл проверяет преподаватель; ИИ-оценивание пока не
                подключено.
              </p>
            )}
            {role === "dds" && (
              <p>
                Только статусы — нужные бригады назначены заранее. Только
                назначение — достаточно выбрать бригады. Оба навыка — полный
                процесс работы с бригадами.
              </p>
            )}
          </>
        )}
        {!focused && (
          <p>
            Выполняется вся ситуация целиком. Предзаполнение отдельных навыков
            не применяется.
          </p>
        )}
        <TextField
          select
          label="Максимальная помощь"
          value={value.assistance.max_level}
          disabled={value.kind === "assessment"}
          onChange={(e) =>
            onChange({
              ...value,
              assistance: {
                max_level: e.target.value as AssistancePolicy["max_level"],
                on_request: true,
              },
            })
          }
        >
          {Object.entries(assistanceLabels).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {value.kind === "assessment" ? (
          <Alert severity="info">
            Контроль проходит без подсказок и учитывается отдельно от
            тренировок.
          </Alert>
        ) : (
          value.assistance.max_level !== "none" && (
            <Alert severity="info">
              После паузы система напоминает оставшуюся цель текстом. Более
              подробную помощь ученик запрашивает сам; подсветка появляется
              только там, где она помогает выполнить действие. Все выданные
              подсказки видны преподавателю в журнале.
            </Alert>
          )
        )}
      </div>
    </section>
  );
}
