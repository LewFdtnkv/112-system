import { type ProfileInput, type ServiceProfile } from "@/entities/catalog";
export type ProfileFormProps = {
  initial: ProfileInput;
  existing?: ServiceProfile;
  onSaved: () => void;
};
