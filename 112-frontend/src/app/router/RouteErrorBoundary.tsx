import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ForbiddenPage } from "@/pages/forbidden";
import { NotFoundPage } from "@/pages/not-found";
import { ServerErrorPage } from "@/pages/server-error";

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  let content = <ServerErrorPage />;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) content = <NotFoundPage />;
    if (error.status === 403) content = <ForbiddenPage />;
  }

  return <main>{content}</main>;
};
