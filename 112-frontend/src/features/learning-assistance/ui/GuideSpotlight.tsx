import { createPortal } from "react-dom";
import { useGuidePanel } from "../model/useGuidePanel";
import type { GuideSpotlightProps } from "../types/guide";

export function GuideSpotlight({
  hint,
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
            aria-label="Свернуть сопровождение"
            onClick={onPause}
          >
            ×
          </button>
        </header>
        <h2>
          {hint.target === "submit" ? "Завершите карточку" : "Попробуйте сами"}
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
                : "Следующий шаг появится после выполнения действия."}
          </small>
          <button type="button" onClick={onCheck} disabled={busy}>
            Проверить шаг
          </button>
        </footer>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>,
    host,
  );
}
