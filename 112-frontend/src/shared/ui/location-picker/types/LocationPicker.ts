import type { GeocodedAddress } from "@/shared/lib/maps/dadata";
import type { MapPoint } from "@/shared/lib/geo";

export type LocationPickerProps = {
  initial: MapPoint | null;
  initialAddress?: string;
  readOnly?: boolean;
  onConfirm: (selection: {
    point: MapPoint;
    address?: GeocodedAddress;
  }) => void;
  onCancel: () => void;
};
