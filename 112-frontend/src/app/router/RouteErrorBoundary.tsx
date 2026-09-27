import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ForbiddenPage } from "@/pages/forbidden";
import { NotFoundPage } from "@/pages/not-found";
import { ServerErrorPage } from "@/pages/server-error";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Button } from "@mui/material";
import { isAssetLoadError } from "../model/assetRecovery";

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  if (isAssetLoadError(error)) {
    return (
      <main>
        <PageHeader
          title="Не удалось загрузить страницу"
          description="Возможно, приложение обновилось или прервалось соединение. Обновите страницу, чтобы продолжить."
          actions={
            <Button onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          }
        />
      </main>
    );
  }
  let content = <ServerErrorPage />;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) content = <NotFoundPage />;
    if (error.status === 403) content = <ForbiddenPage />;
  }

  return <main>{content}</main>;
};
