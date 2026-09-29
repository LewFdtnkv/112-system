import { Link } from "react-router-dom";

import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";

export const ServerErrorPage = () => {
  return (
    <PageHeader
      title="500. Произошла ошибка"
      description="Попробуйте открыть страницу ещё раз."
      actions={<Link to={routePaths.home}>На главную</Link>}
    />
  );
};
