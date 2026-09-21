import { type CardTemplate } from "@/entities/training";
export type CardEditorProps = {
  onClose: () => void;
  initial?: CardTemplate;
  onReload?: () => void;
};
