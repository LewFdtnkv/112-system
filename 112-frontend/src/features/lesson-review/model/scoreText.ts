/** The semantic share can produce fractional points; keep results readable. */
export function scoreText(value: number | string): string {
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
