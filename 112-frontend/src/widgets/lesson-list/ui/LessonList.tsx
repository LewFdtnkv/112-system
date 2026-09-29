import { StudentProfileDialog } from "@/features/student-profile";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { Stack } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLessonList } from "../model/useLessonList";
import type { LessonListProps } from "../types/LessonList";
import { LessonListFilters } from "./LessonListFilters";
import { LessonListTable } from "./LessonListTable";
export function LessonList({
  student = false,
  resultsOnly = false,
  lessonId,
  studentId,
}: LessonListProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<string | null>(null);
  const state = useLessonList({ student, resultsOnly, lessonId, studentId });
  const resetPage = (update: (value: string) => void) => (value: string) => {
    update(value);
    state.setPage(0);
  };
  return (
    <Stack spacing={2}>
      <LessonListFilters
        search={state.search}
        status={state.status}
        role={state.role}
        kind={state.kind}
        resultsOnly={resultsOnly}
        refreshing={state.query.isFetching}
        onSearchChange={resetPage(state.setSearch)}
        onStatusChange={resetPage(state.setStatus)}
        onRoleChange={resetPage(state.setRole)}
        onKindChange={resetPage(state.setKind)}
        onRefresh={() => void state.query.refetch()}
      />
      {profile && (
        <StudentProfileDialog
          studentId={profile}
          onClose={() => setProfile(null)}
        />
      )}
      <QueryState
        pending={state.query.isPending}
        error={state.query.error}
        retry={() => void state.query.refetch()}
      >
        {state.query.data && (
          <>
            <p role="status">
              Назначено: {state.query.data.assigned_count} · В процессе:{" "}
              {state.query.data.in_progress_count} · Завершено:{" "}
              {state.query.data.submitted_count} · Оценено:{" "}
              {state.query.data.graded_count}
            </p>
            {state.query.data.items.length ? (
              <LessonListTable
                items={state.query.data.items}
                student={student}
                resultsOnly={resultsOnly}
                studentId={studentId}
                onStudentSelect={setProfile}
                onNavigate={navigate}
              />
            ) : (
              <EmptyState title="Занятия не найдены" />
            )}
            <PageControls
              total={state.query.data.total}
              page={state.page}
              onPage={state.setPage}
            />
          </>
        )}
      </QueryState>
    </Stack>
  );
}
