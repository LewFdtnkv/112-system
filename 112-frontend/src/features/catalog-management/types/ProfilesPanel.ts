import {
  type ProfileInput,
  type ServiceProfile,
  type Service,
} from "@/entities/catalog";
export type ProfilesPanelProps = {
  service?: Service;
};
export type ProfileFormProps = {
  initial: ProfileInput;
  existing?: ServiceProfile;
  onSaved: () => void;
  service?: Service;
};
