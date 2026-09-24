import { catalogApi } from "@/entities/training";
import { useMutation } from "@tanstack/react-query";

export function useCatalogImport(onImported: () => void) {
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 8 * 1024 * 1024) throw new Error("Файл больше 8 МБ");
      return catalogApi.import(await file.text());
    },
    onSuccess: onImported,
  });
}
