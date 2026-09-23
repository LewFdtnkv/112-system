import { trainingApi } from "@/entities/training";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { GroupDisbandProps } from "../types/GroupDisband";

export function useGroupDisband({ group, onDisbanded }: GroupDisbandProps) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => trainingApi.disbandGroup(group.id),
    onSuccess: () => {
      setOpen(false);
      onDisbanded?.();
      for (const key of [
        "groups",
        "group-options",
        "transfer-group-options",
        "group-members",
        "group-students",
        "users",
        "student-profile",
        "student-overview",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  return {
    open,
    mutation,
    show: () => {
      mutation.reset();
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}
