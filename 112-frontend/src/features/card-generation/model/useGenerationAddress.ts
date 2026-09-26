import { useState } from "react";
import type { LocationPickerProps } from "@/shared/ui/location-picker";
import type { CardGenerationModel } from "../types/CardGenerationPanels";
export function useGenerationAddress(model: CardGenerationModel) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const confirm: LocationPickerProps["onConfirm"] = ({ point, address }) => {
    if (!address?.street || !address.localities.length) {
      setError(
        "Выберите адрес с населённым пунктом и улицей. Можно уточнить их в поиске над картой.",
      );
      return;
    }
    model.change({
      locality: address.localities.at(-1)!,
      street: address.street,
      house: address.house || null,
      building: address.house ? address.building || null : null,
      structure: address.house ? address.structure || null : null,
      address_format: address.house ? "structured" : "descriptive",
      address_description: address.house ? null : address.addressLine,
      location: point,
    });
    setError("");
    setOpen(false);
  };
  return { open, setOpen, error, confirm };
}
