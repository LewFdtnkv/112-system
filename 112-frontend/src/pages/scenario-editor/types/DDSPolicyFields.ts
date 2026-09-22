import { type DDSPolicy } from "@/entities/training";
export type DDSPolicyFieldsProps = {
  profileId?: string;
  value: DDSPolicy;
  onChange: (value: DDSPolicy) => void;
};
