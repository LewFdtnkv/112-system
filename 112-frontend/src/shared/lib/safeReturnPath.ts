import { routePaths } from "@/shared/config/routes";
export const safeReturnPath = (from: unknown): string => {
  if (!from || typeof from !== "object" || !("pathname" in from))
    return routePaths.home;
  const { pathname } = from;
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    [...pathname].some((char) => char.charCodeAt(0) <= 32) ||
    [routePaths.login, routePaths.changePassword].includes(
      pathname as typeof routePaths.login,
    )
  )
    return routePaths.home;
  const search =
    "search" in from &&
    typeof from.search === "string" &&
    from.search.startsWith("?")
      ? from.search
      : "";
  const hash =
    "hash" in from && typeof from.hash === "string" && from.hash.startsWith("#")
      ? from.hash
      : "";
  return `${pathname}${search}${hash}`;
};
