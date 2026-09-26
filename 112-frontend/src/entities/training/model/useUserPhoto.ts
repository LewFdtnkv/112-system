import { useQuery } from "@tanstack/react-query";
import { activityApi } from "../api/activityApi";

export function useUserPhoto(userId: string) {
  return useQuery({
    queryKey: ["user-photo", userId],
    queryFn: async ({ signal }) => {
      const photo = await activityApi.photo(userId, signal);
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
