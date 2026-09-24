import { GuideSessionProvider } from "@/features/learning-assistance";
import { TelephoneSessionProvider } from "@/features/telephone";
import { useStudentWorkspace } from "../model/useStudentWorkspace";
import type { WorkspaceProps } from "../types/TrainingWorkspacePage";
import { WorkspaceDesk } from "./WorkspaceDesk";
import { WorkspaceStartScreen } from "./WorkspaceStartScreen";
export function Workspace(props: WorkspaceProps) {
  return (
    <TelephoneSessionProvider>
      <GuideSessionProvider key={props.lesson.id}>
        <WorkspaceContent {...props} />
      </GuideSessionProvider>
    </TelephoneSessionProvider>
  );
}
function WorkspaceContent({ lesson }: WorkspaceProps) {
  const workspace = useStudentWorkspace({ lesson });
  return workspace.unopened ? (
    <WorkspaceStartScreen lesson={lesson} workspace={workspace} />
  ) : (
    <WorkspaceDesk lesson={lesson} workspace={workspace} />
  );
}
