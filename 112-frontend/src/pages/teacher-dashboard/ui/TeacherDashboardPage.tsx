import { useAuthStore } from "@/entities/user";
import { PageHeader } from "@/shared/ui/PageHeader";
import { LessonList } from "@/widgets/lesson-list";
import { Stack } from "@mui/material";
import { Link } from "react-router-dom";
export const TeacherDashboardPage = () => {
  const user = useAuthStore((state) => state.session);
  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет преподавателя" description={user?.name} />
      <nav aria-label="Работа преподавателя">
        <ul className="action-links">
          <li>
            <Link to="/scenarios">Сценарии</Link>
          </li>
          <li>
            <Link to="/cards">Карточки</Link>
          </li>
          <li>
            <Link to="/groups">Группы</Link>
          </li>
          <li>
            <Link to="/training">Запуск занятий</Link>
          </li>
          <li>
            <Link to="/analytics">Аналитика</Link>
          </li>
        </ul>
      </nav>
      <LessonList student={false} />
    </Stack>
  );
};
