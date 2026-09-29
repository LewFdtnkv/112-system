import { getApiError } from "@/shared/api/errors";
import { translateToRussian } from "@/shared/lib/translation/yandex";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function useCardTranslation(initialText: string) {
  const [source, setSourceValue] = useState(initialText);
  const [translation, setTranslation] = useState("");
  const mutation = useMutation({
    mutationFn: translateToRussian,
    onSuccess: (result) => setTranslation(result.text),
  });
  const setSource = (value: string) => {
    setSourceValue(value);
    setTranslation("");
    mutation.reset();
  };
  const translate = () => {
    if (!source.trim()) return;
    setTranslation("");
    mutation.mutate(source.trim());
  };
  return {
    source,
    setSource,
    translation,
    setTranslation,
    translate,
    detectedLanguage: mutation.data?.detected_language_code,
    pending: mutation.isPending,
    error: mutation.error ? getApiError(mutation.error).message : undefined,
  };
}
