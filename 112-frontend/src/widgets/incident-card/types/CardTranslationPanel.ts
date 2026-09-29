export interface Props {
  initialText: string;
  onApply: (translation: string) => void;
  onClose: () => void;
}
