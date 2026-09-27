import { useIsMutating } from "@tanstack/react-query";
import { CardAudio } from "./CardAudio";
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
  const uploading = useIsMutating({ mutationKey: ["recording-upload"] }) > 0;
  const editor = useCardEditor({ onClose, initial });
  const { callerPhone, phoneRef, save } = editor;
  return (
    <ValidatedForm
      error={save.error}
      className="template-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (uploading) return;
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
              Укажите только особенности этой карточки, общие для 112 и ДДС. Не
              повторяйте инструкцию сценария и правила службы. Поле можно
              оставить пустым. Исходную историю и новые сообщения бригад укажите
              в разделе ДДС.
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
            recipientServiceIds={
              editor.silent
                ? []
                : (editor.manualRecipients?.map((service) => service.id) ??
                  editor.recipients)
            }
            value={editor.ddsExercise}
            onChange={editor.setDDSExercise}
          />
          {editor.ddsExercise?.crew_calls_required && (
            <CardAudio
              kind="crew"
              value={editor.audio}
              onChange={editor.setAudio}
            />
          )}
        </CardRoleSection>
      </CardSections>
      <Stack className="template-editor-actions" direction="row" spacing={2}>
        <Button
          type="submit"
          disabled={save.isPending || editor.routes.isFetching || uploading}
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
