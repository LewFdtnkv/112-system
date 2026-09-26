import { serviceProfileApi } from "@/entities/training";
import { useQuery } from "@tanstack/react-query";

export const useDDSProfile = (id?: string) =>
  useQuery({
    queryKey: ["profile", id],
    enabled: !!id,
    queryFn: ({ signal }) => serviceProfileApi.get(id!, signal),
  });
