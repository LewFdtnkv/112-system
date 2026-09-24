import { createPortal } from "react-dom";
import { useGuidePanel } from "../model/useGuidePanel";
import type { GuideSpotlightProps } from "../types/guide";

export function GuideSpotlight({
  hint,
  hideCheck = false,
  busy,
  error,
  onCheck,
  onPause,
}: GuideSpotlightProps) {
  const { geometry, panel, w, h, g, style, host } = useGuidePanel({
    hint,
    onPause,
  });
  return createPortal(
    <div className="interface-guide-layer">
      {g && (
        <svg
          className="interface-guide-veil"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d={`M0 0H${w}V${h}H0Z M${g.left} ${g.top}v${g.height}h${g.width}v-${g.height}Z`}
          />
          <rect x={g.left} y={g.top} width={g.width} height={g.height} rx="5" />
        </svg>
      )}
      <section
        ref={panel}
        className="interface-guide-panel"
        aria-label="Текущий шаг обучения"
        style={style}
      >
        <header>
          <span>ОСВОЕНИЕ ИНТЕРФЕЙСА</span>
          <button
            type="button"
            aria-label="Отключить сопровождение"
            onClick={onPause}
          >
            ×
          </button>
        </header>
        <h2>
          {hint.target === "source"
            ? "Сначала прочитайте задачу"
            : hint.task === "guide.services"
              ? "Проверьте службы"
              : hint.target === "submit"
                ? "Завершите карточку"
                : "Следующий шаг"}
        </h2>
        <div aria-live="polite" aria-atomic="true">
          {geometry?.message && (
            <p className="interface-guide-action">{geometry.message}</p>
          )}
          {hint.text.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {!g && (
            <p>
              Нужная область пока скрыта. Закройте вспомогательное окно или
              вернитесь к карточке.
            </p>
          )}
        </div>
        <footer>
          <small>
            {geometry?.message?.startsWith("Заполните открытое окно")
              ? "Подтвердите действие галочкой в открытом окне."
              : busy
                ? "Проверяем сохранённые действия…"
                : hideCheck
                  ? hint.task === "journal.waiting"
                    ? "Следите за новыми карточками в списке."
                    : "Нажмите подсвеченную кнопку, когда будете готовы."
                  : hint.advance === "confirm"
                    ? hint.task.startsWith("guide.")
                      ? "Продолжите, когда будете готовы."
                      : "Допишите ответ, затем нажмите «Продолжить»."
                    : "Перейдём дальше, когда ответ будет верным."}
          </small>
          {!hideCheck && (
            <button type="button" onClick={onCheck} disabled={busy}>
              {hint.advance === "confirm" ? "Продолжить" : "Проверить шаг"}
            </button>
          )}
          <button
            type="button"
            className="interface-guide-disable"
            onClick={onPause}
          >
            Отключить сопровождение
          </button>
        </footer>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>,
    host,
  );
}
