import { ValidatedForm } from "@/shared/ui/form-validation";
import { Button, Stack } from "@mui/material";
import { useCardEditor } from "../model/useCardEditor";
import type { CardEditorProps } from "../types/CardEditor";
import { CardEditorCondition } from "./CardEditorCondition";
import { CardDDSSettings } from "./CardDDSSettings";
import { CardEditorSolution } from "./CardEditorSolution";
import { CardEditorTextFields } from "./CardEditorTextFields";
import { CardRoleSection, CardSections } from "./CardSections";

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
      <CardSections>
        <CardRoleSection kind="common">
          <div className="card-common-metadata">
            <CardEditorTextFields
              editor={editor}
              initial={initial}
              fields={["title", "instructions"]}
            />
            <p className="template-explanation">
              Общая инструкция показывается ученику в обоих режимах. Указания по
              работе бригад укажите в разделе ДДС.
            </p>
          </div>
          <CardEditorSolution
            editor={editor}
            initial={initial}
            onReload={onReload}
          />
        </CardRoleSection>
        <CardRoleSection kind="operator_112">
          <CardEditorCondition editor={editor} initial={initial} />
        </CardRoleSection>
        <CardRoleSection kind="dds">
          <CardDDSSettings
            value={editor.ddsExercise}
            onChange={editor.setDDSExercise}
          />
        </CardRoleSection>
      </CardSections>
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
