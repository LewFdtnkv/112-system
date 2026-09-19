import {
  type Evaluation,
  criterionOrder,
  criterionLabels,
} from "@/entities/evaluation/demoEvaluations/types/demoEvaluationsTypes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface CriteriaBreakdownChartProps {
  evaluations: readonly Evaluation[];
}

export const CriteriaBreakdownChart = ({
  evaluations,
}: CriteriaBreakdownChartProps) => {
  const data = criterionOrder.map((key) => {
    const scores = evaluations
      .map((evaluation) =>
        evaluation.criteria.find((criterion) => criterion.key === key),
      )
      .filter((criterion): criterion is NonNullable<typeof criterion> =>
        Boolean(criterion),
      );

    const percent = scores.length
      ? Math.round(
          (scores.reduce((sum, criterion) => sum + criterion.score, 0) /
            scores.reduce((sum, criterion) => sum + criterion.maxScore, 0)) *
            100,
        )
      : 0;

    return { key, label: criterionLabels[key], percent };
  });

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="label" width={140} />
          <Tooltip formatter={(value) => [`${value}%`, "Средний результат"]} />
          <Bar dataKey="percent" fill="#167aa5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
