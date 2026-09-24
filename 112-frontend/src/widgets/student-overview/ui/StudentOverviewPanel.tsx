import "../styles/student-overview.scss";
import type { StudentOverviewPanelProps } from "../types/StudentOverviewPanel";
import { StudentActiveLessons } from "./StudentActiveLessons";
import { StudentIdentity } from "./StudentIdentity";
import { StudentPerformance } from "./StudentPerformance";
export function StudentOverviewPanel({
  data,
  own = false,
  onActivePage,
}: StudentOverviewPanelProps) {
  return (
    <div className="student-overview">
      <StudentIdentity user={data.user} groups={data.groups} />
      <StudentActiveLessons data={data} own={own} onPage={onActivePage} />
      <StudentPerformance data={data} own={own} />
    </div>
  );
}
