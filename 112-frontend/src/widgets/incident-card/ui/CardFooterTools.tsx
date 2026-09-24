import { ArmIconButton } from "@/shared/ui/arm";
import type { CardFooterToolsProps } from "../types/CardFooterTools";
export function CardFooterTools({
  editor,
  viewing,
  disabled,
  commentOpen,
  onCommentToggle,
  onClose,
  onTiming,
}: CardFooterToolsProps) {
  return (
    <div className="arm-footer-tools">
      {!viewing && (
        <>
          <button
            className="arm-small-button"
            disabled={disabled}
            onClick={editor.saveDraft}
          >
            Сохранить черновик
          </button>
          <button
            className="arm-save"
            data-learning-target="submit"
            aria-label={
              editor.remote.notificationRequired === false
                ? "Сохранить без оповещения"
                : "Оповестить и сохранить карточку"
            }
            disabled={disabled}
            onClick={editor.submit}
          >
            сохранить
          </button>
          <ArmIconButton
            icon="link"
            label="Связанные происшествия — недоступно в этом задании"
            disabled
          />
          <ArmIconButton
            icon="timer"
            label="Время заполнения карточки"
            onClick={onTiming}
          />
          <ArmIconButton
            icon="hand"
            label="Постобработка вызова — недоступно в этом задании"
            disabled
          />
          <ArmIconButton
            icon="bell"
            label="Напоминание — недоступно в этом задании"
            disabled
          />
        </>
      )}
      <ArmIconButton
        icon="comment"
        label="Учебный комментарий и журнал"
        aria-expanded={commentOpen}
        onClick={onCommentToggle}
      />
      <ArmIconButton icon="close" label="Закрыть" onClick={onClose} />
    </div>
  );
}
