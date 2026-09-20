import { useState, type ReactNode } from "react";
import { Button, ToggleButton, ToggleButtonGroup } from "@mui/material";
import {
  comparisonFields,
  fieldVerdict,
  type ComparisonField,
  type ReviewedCard,
} from "../model/comparison";
import "./card-comparison.scss";

function Verdict({
  field,
  submitted,
}: {
  field: ComparisonField;
  submitted: boolean;
}) {
  const verdict = fieldVerdict(field, submitted);
  return (
    <span className={`comparison-verdict comparison-verdict--${verdict.tone}`}>
      <b aria-hidden="true">{verdict.symbol}</b> {verdict.label}
    </span>
  );
}
export function CardComparison({
  row,
  actions,
}: {
  row: ReviewedCard;
  actions?: ReactNode;
}) {
  const [layout, setLayout] = useState<"paired" | "tiles" | "table">("table");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const allFields = comparisonFields(row);
  const fields = allFields.filter(
    (f) => !issuesOnly || !["matched", "unscored"].includes(f.status),
  );
  const groups = [...new Set(fields.map((f) => f.group))];
  const submitted = row.attempt?.status !== "in_progress";
  const check = row.automatic_check;
  const countTone = (tone: string) =>
    allFields.filter((f) => fieldVerdict(f, submitted).tone === tone).length;
  return (
    <section
      className={`card-comparison card-comparison--${layout}`}
      aria-label={`Разбор карточки ${row.position}`}
    >
      <div className="comparison-heading">
        <div>
          <h3>Ответ ученика и эталонное решение</h3>
          <p>
            Сопоставьте сведения по каждому полю. Другая формулировка может быть
            корректной.
          </p>
        </div>
        {actions}
      </div>
      <div className="comparison-toolbar">
        <ToggleButtonGroup
          exclusive
          value={layout}
          onChange={(_, value) => value && setLayout(value)}
          size="small"
          aria-label="Вид сравнения"
        >
          <ToggleButton value="paired">Рядом</ToggleButton>
          <ToggleButton value="tiles">Блоками</ToggleButton>
          <ToggleButton value="table">Таблица</ToggleButton>
        </ToggleButtonGroup>
        <Button
          aria-pressed={issuesOnly}
          onClick={() => setIssuesOnly(!issuesOnly)}
          disabled={!check}
        >
          {issuesOnly ? "Показать все поля" : "Только расхождения и проверка"}
        </Button>
      </div>
      {check && (
        <div className="comparison-summary" aria-label="Сводка проверки">
          <span className="comparison-verdict--success">
            ✓ Совпало: {countTone("success")}
          </span>
          <span className="comparison-verdict--error">
            ! Расхождения и пропуски: {countTone("error")}
          </span>
          <span className="comparison-verdict--warning">
            ? Требует проверки: {countTone("warning")}
          </span>
        </div>
      )}
      {!row.attempt && (
        <p className="comparison-notice">
          Ученик ещё не начал карточку. Показано эталонное решение, проверка ещё
          не выполнялась.
        </p>
      )}
      {!submitted && (
        <p className="comparison-notice">
          Черновик: ученик ещё работает. Это предварительное сравнение, а не
          итоговая оценка.
        </p>
      )}
      <p className="comparison-note">
        Зелёный — совпадение; красный — расхождение проверяемого поля; жёлтый —
        нужна проверка. Смысл текста автоматически не оценён. ИИ пока не
        подключён.
      </p>
      {!fields.length && (
        <p className="comparison-notice">
          Расхождений и полей для проверки нет.
        </p>
      )}
      {layout === "table" ? (
        <div className="comparison-table-wrap">
          <table aria-label="Автоматическая проверка полей">
            <thead>
              <tr>
                <th>Поле</th>
                <th>Ответ ученика</th>
                <th>Эталонное решение</th>
                <th>Проверка</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr
                  key={f.field}
                  data-verdict={fieldVerdict(f, submitted).tone}
                >
                  <th scope="row">
                    {f.label}
                    {!f.scored && <small>Вне балла</small>}
                  </th>
                  <td>{f.actual || "—"}</td>
                  <td>{f.expected || "—"}</td>
                  <td>
                    <Verdict field={f} submitted={submitted} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="comparison-groups">
          {groups.map((group) => (
            <section
              className="comparison-group"
              key={group}
              aria-label={group}
            >
              <h4>{group}</h4>
              {layout === "paired" && (
                <div className="comparison-column-titles">
                  <span>Ответ ученика</span>
                  <span>Эталонное решение</span>
                </div>
              )}
              <div className="comparison-fields">
                {fields
                  .filter((f) => f.group === group)
                  .map((f) => (
                    <article
                      className="comparison-field"
                      key={f.field}
                      data-verdict={fieldVerdict(f, submitted).tone}
                    >
                      <div className="comparison-field-heading">
                        <strong>{f.label}</strong>
                        <Verdict field={f} submitted={submitted} />
                        {!f.scored && <small>Вне балла</small>}
                      </div>
                      <div className="comparison-values">
                        <div className="comparison-actual">
                          <small>Ответ ученика</small>
                          <p>
                            {f.actual || (
                              <span className="comparison-empty">
                                {row.attempt ? "Не заполнено" : "Не начато"}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="comparison-expected">
                          <small>Эталонное решение</small>
                          <p>
                            {f.expected || (
                              <span className="comparison-empty">
                                Не задано
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
