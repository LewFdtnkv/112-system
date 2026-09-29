import type { Attempt } from "@/entities/training";

/** Remove only repeated paragraphs; similar instructions may contain distinct requirements. */
export function ddsPanelText(attempt: Attempt) {
  const seen = new Set<string>();
  const unique = (text: string) =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => {
        const key = p.replace(/\s+/g, " ");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n\n");
  const dds = attempt.dds!;
  const condition = unique(
    [dds.workflow?.startsWith("crews-") ? "" : dds.goal, dds.information?.message]
      .filter(Boolean)
      .join("\n\n") || dds.goal,
  );
  const instruction = unique(attempt.instructions);
  const reference = unique(
    [dds.profile.responsibility, dds.profile.procedure].join("\n\n"),
  );
  return { condition, instruction, reference };
}
