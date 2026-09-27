export interface GroupAnalysisProps {
  groupId: string;
  groupName: string;
}
export interface GroupAnalysis {
  statistics: {
    kind: string;
    skill: string;
    label: string;
    students: number;
    affected: number;
    cards: number;
    failed_cards: number;
    examples: {
      lesson_id: string;
      student_id: string;
      position: number;
      label: string;
    }[];
  }[];
  teacher_reviewed_cards: number;
  job: null | {
    id: string;
    status: string;
    error: string | null;
    obsolete: boolean;
    mode: string | null;
    recommendations: { id: string; skill: string; text: string }[];
  };
}
