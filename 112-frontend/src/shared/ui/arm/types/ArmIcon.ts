import type { ButtonHTMLAttributes } from "react";
import type { icons } from "../model/icons";
export type ArmIconName = keyof typeof icons;

export type ArmIconProps = { name: ArmIconName };

export type ArmIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ArmIconName;
  label: string;
};
