import { Link } from "react-router-dom";

import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";

export const NotFoundPage = () => {
  return (
    <PageHeader
      title="404. Страница не найдена"
      description="Проверьте адрес или вернитесь на главную страницу."
      actions={<Link to={routePaths.home}>На главную</Link>}
    />
  );
};
