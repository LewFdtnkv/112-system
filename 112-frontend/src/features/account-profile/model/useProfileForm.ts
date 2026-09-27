import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { userApi } from "@/entities/user";
import { useProfileCache } from "./useProfileCache";
import type { ProfileFormProps, ProfileValues } from "../types/profile";
export function useProfileForm({ user, onClose }: ProfileFormProps) {
  const [value, setValue] = useState<ProfileValues>({
    first_name: user.first_name,
    last_name: user.last_name,
    middle_name: user.middle_name,
  });
  const refresh = useProfileCache();
  const save = useMutation({
    mutationFn: () =>
      userApi.updateMe({
        ...value,
        middle_name: value.middle_name?.trim() || null,
      }),
    onSuccess: (updated) => {
      refresh(updated);
      onClose();
    },
  });
  return { value, setValue, save };
}
