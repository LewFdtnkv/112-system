import { type ProfileInput, type ServiceProfile } from "@/entities/training";
export type ProfileFormProps = {
  initial: ProfileInput;
  existing?: ServiceProfile;
  onSaved: () => void;
};
