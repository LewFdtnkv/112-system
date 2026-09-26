import type { TrainingPanelProps } from "../types/TrainingPanel";
import "../styles/training-panel.scss";

export function TrainingPanel({
  condition,
  instruction,
  reference,
  navigation,
  children,
}: TrainingPanelProps) {
  return (
    <section className="training-panel" aria-label="Учебное задание">
      {navigation}
      <div className="training-panel__source" data-learning-target="source">
        {condition && (
          <div className="training-panel__row">
            <strong>Условие</strong>
            <div>{condition}</div>
          </div>
        )}
        <div className="training-panel__row">
          <strong>Инструкция</strong>
          <div>{instruction}</div>
        </div>
        {reference}
      </div>
      {children}
    </section>
  );
}
