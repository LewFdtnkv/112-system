import type { Evaluation } from "@/entities/evaluation/demoEvaluations/types/demoEvaluationsTypes";
import { incidentCardFieldLabels } from "../types/ErrorHeatmapTypes";

interface ErrorHeatmapProps {
  evaluations: readonly Evaluation[];
}

const fieldFromFindingKey = {
  field_accuracy: "address" as const,
  routing: "services" as const,
  completeness: "callerName" as const,
};

export const ErrorHeatmap = ({ evaluations }: ErrorHeatmapProps) => {
  const counts = new Map<string, number>();

  for (const evaluation of evaluations) {
    for (const issue of evaluation.grammarIssues) {
      counts.set(issue.field, (counts.get(issue.field) ?? 0) + 1);
    }

    for (const criterion of evaluation.criteria) {
      const field =
        fieldFromFindingKey[criterion.key as keyof typeof fieldFromFindingKey];
      if (field && criterion.findings.length > 0) {
        counts.set(field, (counts.get(field) ?? 0) + criterion.findings.length);
      }
    }
  }

  const max = Math.max(1, ...counts.values());
  const cells = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (cells.length === 0) {
    return <p>Замечаний по полям карточки пока нет.</p>;
  }

  return (
    <div
      className="error-heatmap"
      role="table"
      aria-label="Ошибки по полям карточки"
    >
      {cells.map(([field, count]) => {
        const intensity = count / max;
        const label = incidentCardFieldLabels[field] ?? field;

        return (
          <div
            className="error-heatmap__row"
            key={field}
            role="row"
            style={{ "--intensity": intensity } as never}
          >
            <span role="cell">{label}</span>
            <span
              role="cell"
              className="error-heatmap__bar"
              aria-label={`${count} замечаний`}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
};
