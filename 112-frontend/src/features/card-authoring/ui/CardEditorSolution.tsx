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
      <h3>Эталонное решение</h3>
      <p className="template-explanation">
        Заполняйте только известные из условия сведения. Пустое необязательное
        поле не считается ошибкой ученика.
      </p>
      <CardEditorClassification editor={editor} initial={initial} />
      <CardEditorRouting
        editor={editor}
        initial={initial}
        onReload={onReload}
      />
    </section>
  );
}
