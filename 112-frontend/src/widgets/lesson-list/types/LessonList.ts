export type LessonListProps = {
  student?: boolean;
  resultsOnly?: boolean;
  lessonId?: string;
  studentId?: string;
};

export type LessonListFiltersProps = {
  search: string;
  status: string;
  role: string;
  kind: string;
  resultsOnly: boolean;
  refreshing: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onRefresh: () => void;
};
export type LessonListTableProps = {
  items: import("@/entities/training").LessonRow[];
  student: boolean;
  studentId?: string;
  onStudentSelect: (id: string) => void;
  onNavigate: (path: string) => void;
};
