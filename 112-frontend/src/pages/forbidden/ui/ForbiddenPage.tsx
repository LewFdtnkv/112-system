import { Link } from "react-router-dom";

import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";

export const ForbiddenPage = () => {
  return (
    <PageHeader
      title="403. Доступ запрещён"
      description="У вас нет доступа к этой странице."
      actions={<Link to={routePaths.home}>На главную</Link>}
    />
  );
};
