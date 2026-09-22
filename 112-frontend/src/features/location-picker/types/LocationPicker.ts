import { type MapPoint } from "@/shared/lib/maps/yandex";
export type LocationPickerProps = {
  initial: MapPoint | null;
  readOnly?: boolean;
  onConfirm: (point: MapPoint) => void;
  onCancel: () => void;
};
