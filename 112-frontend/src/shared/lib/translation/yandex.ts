import { backendApi } from "@/shared/api/backendApi";

import type { TranslationResponse } from "./types/YandexTranslation";

export async function translateToRussian(text: string) {
  return backendApi
    .post("translations/translate", {
      json: { text, target_language_code: "ru" },
    })
    .json<TranslationResponse>();
}
