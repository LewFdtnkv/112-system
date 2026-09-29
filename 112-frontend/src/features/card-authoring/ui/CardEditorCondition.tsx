import { CardAudio } from "./CardAudio";
import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { CardEditorTextFields } from "./CardEditorTextFields";

export function CardEditorCondition({
  editor,
  initial,
}: Pick<CardEditorPanelProps, "editor" | "initial">) {
  return (
    <>
      <CardEditorTextFields
        editor={editor}
        initial={initial}
        fields={["caller_message"]}
      />
      <p className="template-explanation">
        Укажите факты, по которым оператор 112 сможет заполнить общие поля.
        Эталонное решение ему не показывается. Если карточка нужна только для
        ДДС, сообщение заявителя можно оставить пустым.
      </p>
      <CardAudio
        kind="caller"
        initialText={editor.form.caller_message}
        value={editor.audio}
        onChange={editor.setAudio}
      />
    </>
  );
}
