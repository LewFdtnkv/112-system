import {
  lessonApi,
  trainingKeys,
  scenarioApi,
  scenarioDifficultyLabel,
  type ScenarioItem,
  defaultLearningPolicy,
  type LearningPolicy,
} from "@/entities/training";
import { getTrainingSessionPath } from "@/shared/config/routes";
import { randomUUID } from "@/shared/lib/uuid";
import type { SelectOption } from "@/shared/ui/ServerSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function useLessonLaunch() {
  const [params] = useSearchParams();
  const [group, updateGroup] = useState<SelectOption | null>(() =>
    params.get("group")
      ? { id: params.get("group")!, label: "Выбранная группа" }
      : null,
  );
  const [targets, setTargets] = useState<
    { id: string; label: string; kind: "group" | "student" }[]
  >([]);
  const [from, updateFrom] = useState("");
  const [until, updateUntil] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [student, updateStudent] = useState<SelectOption | null>(null);
  const [scenario, updateScenario] = useState<SelectOption | null>(() =>
    params.get("scenario")
      ? {
          id: params.get("scenario")!,
          label: params.get("title") ?? "Выбранный сценарий",
        }
      : null,
  );
  const metadata = scenario?.metadata as
    Partial<Pick<ScenarioItem, "role" | "difficulty">> | undefined;
  const metadataRole = metadata?.role;
  const scenarioDetails = useQuery({
    queryKey: ["scenario", scenario?.id],
    queryFn: ({ signal }) => scenarioApi.get(scenario!.id, signal),
    enabled: !!scenario && (!metadataRole || !metadata?.difficulty),
  });
  const scenarioRole = metadataRole ?? scenarioDetails.data?.role;
  const difficulty = metadata?.difficulty ?? scenarioDetails.data?.difficulty;
  const difficultyLabel =
    !difficulty && scenarioDetails.isError
      ? "Не удалось загрузить"
      : !difficulty && scenarioDetails.isFetching
        ? "Загрузка…"
        : scenarioDifficultyLabel(difficulty);
  const [learning, updateLearning] = useState(defaultLearningPolicy);
  const [limit, updateLimit] = useState("");
  const [title, updateTitle] = useState("");
  const [requestId, setRequestId] = useState(() => randomUUID());
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () =>
      lessonApi.start({
        request_id: requestId,
        ...(targets.length
          ? {
              group_ids: targets
                .filter((t) => t.kind === "group")
                .map((t) => t.id),
              student_ids: targets
                .filter((t) => t.kind === "student")
                .map((t) => t.id),
            }
          : { group_id: group!.id }),
        ...(from ? { available_from: new Date(from).toISOString() } : {}),
        ...(until ? { available_until: new Date(until).toISOString() } : {}),
        scenario_version_id: scenario!.id,
        learning,
        ...(!targets.length && student ? { student_id: student.id } : {}),
        ...(title.trim() ? { title } : {}),
        ...(limit ? { time_limit_seconds: Number(limit) * 60 } : {}),
      }),
    onSuccess: (lesson) => {
      void client.invalidateQueries({ queryKey: trainingKeys.lessons });
      navigate(getTrainingSessionPath(lesson.id));
    },
  });
  const changed = () => setRequestId(randomUUID());
  const setGroup = (value: SelectOption | null) => {
    updateGroup(value);
    updateStudent(null);
    changed();
  };
  const setStudent = (value: SelectOption | null) => {
    updateStudent(value);
    changed();
  };
  const setScenario = (value: SelectOption | null) => {
    updateScenario(value);
    updateLearning((previous) => ({ ...previous, target_skills: [] }));
    changed();
  };
  const setFrom = (value: string) => {
    updateFrom(value);
    changed();
  };
  const setUntil = (value: string) => {
    updateUntil(value);
    changed();
  };
  const setLimit = (value: string) => {
    updateLimit(value);
    changed();
  };
  const setTitle = (value: string) => {
    updateTitle(value);
    changed();
  };
  const setLearning = (value: LearningPolicy) => {
    updateLearning(value);
    changed();
  };
  const addTarget = () => {
    const value = student ?? group;
    if (!value) return;
    const kind = student ? "student" : "group";
    setTargets((previous) =>
      previous.some((target) => target.id === value.id && target.kind === kind)
        ? previous
        : [...previous, { ...value, kind }],
    );
    changed();
  };
  const removeTarget = (id: string, kind: "group" | "student") => {
    setTargets((previous) =>
      previous.filter((target) => target.id !== id || target.kind !== kind),
    );
    changed();
  };
  const validate = () => {
    if (until && from && new Date(until) <= new Date(from))
      return [
        {
          path: "available_until",
          message: "Дата окончания должна быть позже даты начала.",
        },
      ];
    if (until && new Date(until).getTime() <= Date.now())
      return [
        {
          path: "available_until",
          message: "Дата окончания уже прошла. Укажите будущую дату.",
        },
      ];
    return [];
  };
  const learningValid =
    !["skill_practice", "review"].includes(learning.kind) ||
    learning.target_skills.length > 0;
  return {
    scenarioRole,
    difficultyLabel,
    group,
    setGroup,
    targets,
    addTarget,
    removeTarget,
    validate,
    from,
    setFrom,
    until,
    setUntil,
    confirm,
    setConfirm,
    student,
    setStudent,
    scenario,
    setScenario,
    learning,
    setLearning,
    learningValid,
    limit,
    setLimit,
    title,
    setTitle,

    mutation,
  };
}
