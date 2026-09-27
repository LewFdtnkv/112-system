import type { TrainingPanelProps } from "../types/TrainingPanel";
import "../styles/training-panel.scss";

export function TrainingPanel({
  condition,
  instruction,
  reference,
  navigation,
  aside,
  children,
}: TrainingPanelProps) {
  const source = (
    <div className="training-panel__source" data-learning-target="source">
      {condition && (
        <div className="training-panel__row">
          <strong>Условие</strong>
          <div>{condition}</div>
        </div>
      )}
      {instruction && (
        <div className="training-panel__row">
          <strong>Инструкция</strong>
          <div>{instruction}</div>
        </div>
      )}
      {reference}
    </div>
  );
  return (
    <section className="training-panel" aria-label="Учебное задание">
      {navigation}
      {aside ? (
        <div className="training-panel__heading">
          {source}
          {aside}
        </div>
      ) : (
        source
      )}
      {children}
    </section>
  );
}
