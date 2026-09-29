import { catalogKeys, serviceProfileApi } from "@/entities/catalog";
import { useQuery } from "@tanstack/react-query";

export const useDDSProfile = (id?: string) =>
  useQuery({
    queryKey: catalogKeys.profile(id),
    enabled: !!id,
    queryFn: ({ signal }) => serviceProfileApi.get(id!, signal),
  });
