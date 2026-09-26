import { useMutation, useQueryClient } from "@tanstack/react-query";
import { activityApi, userApi } from "@/entities/training";
import type { ProfilePhotoProps } from "../types/profile";
export function useProfilePhoto({ userId, own }: ProfilePhotoProps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      own ? userApi.uploadMyPhoto(file) : activityApi.uploadPhoto(userId, file),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["user-photo", userId] }),
  });
}
