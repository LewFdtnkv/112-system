import {
  lessonApi,
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
  const [group, setGroup] = useState<SelectOption | null>(() =>
    params.get("group")
      ? { id: params.get("group")!, label: "Выбранная группа" }
      : null,
  );
  const [targets, setTargets] = useState<
    { id: string; label: string; kind: "group" | "student" }[]
  >([]);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const [scenario, setScenario] = useState<SelectOption | null>(() =>
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
  const [limit, setLimit] = useState("");
  const [title, setTitle] = useState("");
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
        ...(limit ? { time_limit_seconds: Number(limit) } : {}),
      }),
    onSuccess: (lesson) => {
      void client.invalidateQueries({ queryKey: ["lessons"] });
      navigate(getTrainingSessionPath(lesson.id));
    },
  });
  const setLearning = (value: LearningPolicy) => {
    updateLearning(value);
    setRequestId(randomUUID());
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
    setTargets,
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
    setRequestId,
    mutation,
  };
}
