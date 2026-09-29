export interface DDSTileProps {
  guideTarget?: string;
  name: string;
  title?: string;
  status: string;
  updatedAt?: string;
  selected: boolean;
  onClick: () => void;
  kind?: "service" | "crew";
  onEdit?: () => void;
  editDisabled?: boolean;
}
