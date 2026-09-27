import type { Service } from "@/entities/catalog";

export type ServiceDialogProps = {
  service?: Service;
  onClose: () => void;
  onSaved: () => void;
};

export type ServiceFormProps = {
  service?: Service;
  onSaved: (service: Service) => void;
  onCancel: () => void;
};
