import type { ProfileInput } from "@/entities/catalog";

export type ProfileFormChange = (form: ProfileInput) => void;
export type ProfileTerritoriesProps = {
  form: ProfileInput;
  onChange: ProfileFormChange;
};
export type ProfileObjectsProps = {
  form: ProfileInput;
  onChange: ProfileFormChange;
};
export type ProfileContactsProps = {
  form: ProfileInput;
  onChange: ProfileFormChange;
};
