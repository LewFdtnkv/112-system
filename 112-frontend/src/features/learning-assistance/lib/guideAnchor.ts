import type { LearningHint } from "@/entities/training";
import type { GuideAnchor } from "../types/guide";

function visible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(
    (el) =>
      el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]'),
  );
}
const exact = (key: string) =>
  visible(`[data-guide-target="${CSS.escape(key)}"]`);

export function guideAnchor(hint: LearningHint): GuideAnchor | null {
  const dialog = visible(
    '.MuiDialog-root:not(.arm-card-dialog) [role="dialog"]',
  );
  if (dialog) {
    const editor = exact("dds.editor");
    return {
      element: editor ?? dialog,
      message: editor
        ? "Заполните открытое окно и подтвердите действие. Галочка сохраняет запись, крестик закрывает окно без сохранения."
        : "Выберите нужные значения и подтвердите их кнопкой в открытом окне. После закрытия окна вернёмся к карточке.",
    };
  }
  if (hint.target?.startsWith("dds_")) {
    const own = exact("dds.own_service");
    const expand = exact("dds.expand");
    if (!own && expand)
      return {
        element: expand,
        message: "Раскройте полный список служб, чтобы найти свою службу.",
      };
    if (own && own.querySelector('[aria-expanded="false"]'))
      return {
        element: own,
        message:
          "Нажмите плитку своей службы. Она станет серой, а над ней откроется список бригад.",
      };
    const crewCode = hint.task.startsWith("crew.")
      ? hint.task.slice(5, hint.task.lastIndexOf("."))
      : "";
    const crew = exact(`crew.${crewCode}`);
    if (crew)
      return {
        element: crew.querySelector<HTMLElement>(".dds-tile-edit") ?? crew,
        message:
          "Нажмите карандаш на плитке этой бригады, чтобы добавить запись о её статусе.",
      };
    const assign = exact("dds.assign");
    if (assign) return { element: assign };
  }
  const element =
    exact(hint.task) ??
    visible(`[data-learning-target="${CSS.escape(hint.target ?? "")}"]`);
  return element
    ? { element: element.closest<HTMLElement>("label") ?? element }
    : null;
}
