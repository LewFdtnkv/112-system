export function nextPreparedStatus(
  status: string | undefined,
  workflow: string | undefined,
) {
  if (!status || ["cancelled", "refused", "not_accepted"].includes(status))
    return "assigned";
  const path =
    workflow === "crews-v1"
      ? ["assigned", "responding", "arrived", "in_progress", "completed"]
      : [
          "assigned",
          "accepted",
          "responding",
          "arrived",
          "in_progress",
          "completed",
        ];
  return path[Math.min(path.indexOf(status) + 1, path.length - 1)];
}
