import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { CardEditorTextFields } from "./CardEditorTextFields";

export function CardEditorCondition({
  editor,
  initial,
}: Pick<CardEditorPanelProps, "editor" | "initial">) {
  return (
    <aside className="template-condition">
      <h3>Условие для ученика</h3>
      <CardEditorTextFields
        editor={editor}
        initial={initial}
        fields={["title", "caller_message", "instructions"]}
      />
      <p className="template-explanation">
        Укажите здесь все факты, необходимые для решения. Ученик не видит
        эталонное решение.
      </p>
    </aside>
  );
}
