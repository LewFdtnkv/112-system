import type { LearningHint } from "@/entities/training";
import type { JournalGuideProps } from "../types/guide";
export function journalHint(mode: JournalGuideProps["mode"]): LearningHint {
  const messages = {
    start:
      "Нажмите «Приступить к заданию» и подтвердите начало. Откроется первая карточка занятия.",
    new: "Чтобы взять новую карточку, нажмите «+» в списке происшествий. Уже созданные карточки остаются в этом списке.",
    resume:
      "У вас есть незаконченная карточка. Нажмите подсвеченную кнопку, чтобы вернуться к ней. Карточку также можно открыть из списка происшествий.",
    waiting:
      "Здесь появляются карточки ДДС. Они поступают по расписанию, даже если предыдущая ещё не закончена. Когда карточка поступит, откройте её из списка.",
  };
  return {
    id: `journal.${mode}`,
    task: `journal.${mode}`,
    target: `journal.${mode}`,
    level: "solution",
    presentation: "highlight",
    text: messages[mode],
    advance: "action",
  };
}
export const finishedHint: LearningHint = {
  id: "guide.finished",
  task: "close_card",
  target: "close_card",
  level: "solution",
  presentation: "highlight",
  advance: "action",
  text: "Карточка завершена. Закройте её крестиком, чтобы вернуться к списку и открыть следующую.",
};
