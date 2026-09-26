export interface LessonSession {
  remaining: number | null;
  leaving: boolean;
  leave: () => Promise<unknown>;
}
