import { lessonListQueryOptions } from "@/entities/training";
import { useDebounced } from "@/shared/lib/useDebounced";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { LessonListProps } from "../types/LessonList";

export function useLessonList({
  student = false,
  resultsOnly = false,
  lessonId,
  studentId,
}: LessonListProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(resultsOnly ? "submitted" : "all");
  const [role, setRole] = useState("all");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const params = {
    q,
    status,
    role,
    kind,
    limit: 20,
    offset: page * 20,
    ...(studentId ? { student_id: studentId } : {}),
    ...(lessonId ? { lesson_id: lessonId } : {}),
  };
  const query = useQuery(lessonListQueryOptions(student, params));
  return {
    search,
    setSearch,
    status,
    setStatus,
    role,
    setRole,
    kind,
    setKind,
    page,
    setPage,
    query,
  };
}
