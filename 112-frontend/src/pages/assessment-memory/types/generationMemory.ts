export interface GenerationMemoryFilter {
  q: string;
  state: "enabled" | "disabled" | "all";
  page: number;
}
export interface GenerationCardDialogProps {
  id: string;
  onClose: () => void;
}
