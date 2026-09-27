import { validateUploadSize } from "@/shared/lib/uploads";
import { catalogApi } from "@/entities/catalog";
import { useMutation } from "@tanstack/react-query";

export function useCatalogImport(onImported: () => void) {
  return useMutation({
    mutationFn: async (file: File) => {
      validateUploadSize(file);
      return catalogApi.import(await file.text());
    },
    onSuccess: onImported,
  });
}
