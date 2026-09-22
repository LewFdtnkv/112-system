export interface Props {
  name: string;
  shortName?: string | null;
  status: string;
  expanded: boolean;
  onClick: () => void;
}
