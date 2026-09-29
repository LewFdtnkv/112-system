import { userKeys } from "@/entities/user";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/entities/user";
import type { ProfilePhotoProps } from "../types/profile";
export function useProfilePhoto({ userId, own }: ProfilePhotoProps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      own ? userApi.uploadMyPhoto(file) : userApi.uploadPhoto(userId, file),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: userKeys.photo(userId) }),
  });
}
