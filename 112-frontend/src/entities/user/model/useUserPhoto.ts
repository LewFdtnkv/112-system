import { userKeys } from "./userQueries";
import { useQuery } from "@tanstack/react-query";
import { userApi } from "../api/userApi";

export function useUserPhoto(userId: string) {
  return useQuery({
    queryKey: userKeys.photo(userId),
    queryFn: async ({ signal }) => {
      const photo = await userApi.photo(userId, signal);
      if (!photo.size) return null;
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(photo);
      });
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
