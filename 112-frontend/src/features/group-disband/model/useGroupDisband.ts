import { userApi, invalidateGroupMembers } from "@/entities/user";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { GroupDisbandProps } from "../types/GroupDisband";

export function useGroupDisband({ group, onDisbanded }: GroupDisbandProps) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => userApi.disbandGroup(group.id),
    onSuccess: () => {
      setOpen(false);
      onDisbanded?.();
      void invalidateGroupMembers(client);
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
