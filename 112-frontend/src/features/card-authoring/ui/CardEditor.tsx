import { ValidatedForm } from "@/shared/ui/form-validation";
import { Button, Stack } from "@mui/material";
import { useCardEditor } from "../model/useCardEditor";
import type { CardEditorProps } from "../types/CardEditor";
import { CardEditorCondition } from "./CardEditorCondition";
import { CardEditorSolution } from "./CardEditorSolution";

export function CardEditor({ onClose, initial, onReload }: CardEditorProps) {
  const editor = useCardEditor({ onClose, initial });
  const { callerPhone, phoneRef, save } = editor;
  return (
    <ValidatedForm
      error={save.error}
      className="template-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (callerPhone.invalid) {
          callerPhone.reveal();
          phoneRef.current?.focus();
          return;
        }
        save.mutate();
      }}
    >
      <CardEditorCondition editor={editor} initial={initial} />
      <CardEditorSolution
        editor={editor}
        initial={initial}
        onReload={onReload}
      />
      <Stack className="template-editor-actions" direction="row" spacing={2}>
        <Button
          type="submit"
          disabled={save.isPending || editor.routes.isFetching}
        >
          {initial ? "Сохранить изменения" : "Сохранить карточку"}
        </Button>
        <Button onClick={onClose} disabled={save.isPending}>
          Отмена
        </Button>
      </Stack>
    </ValidatedForm>
  );
}
