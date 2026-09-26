import "../styles/student-overview.scss";
import type { StudentOverviewPanelProps } from "../types/StudentOverviewPanel";
import { StudentActiveLessons } from "./StudentActiveLessons";
import { StudentIdentity } from "./StudentIdentity";
import { StudentPerformance } from "./StudentPerformance";
export function StudentOverviewPanel({
  data,
  own = false,
  onActivePage,
  onAvailablePage,
}: StudentOverviewPanelProps) {
  return (
    <div className="student-overview">
      <StudentIdentity user={data.user} groups={data.groups} />
      <StudentActiveLessons
        section="active"
        data={data}
        own={own}
        onPage={onActivePage}
      />
      <StudentActiveLessons
        section="available"
        data={data}
        own={own}
        onPage={onAvailablePage}
      />
      <StudentPerformance data={data} own={own} />
    </div>
  );
}
