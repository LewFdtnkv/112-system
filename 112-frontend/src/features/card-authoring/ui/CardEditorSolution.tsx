import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { CardEditorClassification } from "./CardEditorClassification";
import { CardEditorRouting } from "./CardEditorRouting";

export function CardEditorSolution({
  editor,
  initial,
  onReload,
}: CardEditorPanelProps) {
  return (
    <section className="template-solution">
      <h4>Сведения о происшествии</h4>
      <p className="template-explanation">
        Оператор 112 заполняет эти поля сам, и они используются для сравнения.
        Оператор ДДС видит их уже заполненными. Для 112 задавайте только
        сведения, которые можно получить из сообщения заявителя; неизвестные
        поля оставляйте пустыми.
      </p>
      <div className="card-common-columns">
        <div className="card-common-fields">
          <CardEditorClassification editor={editor} initial={initial} />
        </div>
        <div className="card-common-fields">
          <CardEditorRouting
            editor={editor}
            initial={initial}
            onReload={onReload}
          />
        </div>
      </div>
    </section>
  );
}
