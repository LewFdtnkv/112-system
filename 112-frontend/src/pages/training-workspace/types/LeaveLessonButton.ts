export interface LeaveLessonButtonProps {
  beforeLeave?: () => Promise<unknown>;
  disabled?: boolean;
}
