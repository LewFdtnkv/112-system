import type { UserItem } from "@/entities/training";

export type UserFiltersProps = {
  search: string;
  role: string;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
};
export type UsersTableProps = {
  items: UserItem[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (user: UserItem) => void;
};
export type UserCreateDialogProps = { open: boolean; onClose: () => void };
