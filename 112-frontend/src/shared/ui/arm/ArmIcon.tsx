import { icons } from "./model/icons";
import type { ArmIconButtonProps, ArmIconProps } from "./types/ArmIcon";

export function ArmIcon({ name }: ArmIconProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" fontSize="inherit" />;
}
export function ArmIconButton({
  icon,
  label,
  className = "",
  ...props
}: ArmIconButtonProps) {
  return (
    <button
      type="button"
      className={`arm-icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <ArmIcon name={icon} />
    </button>
  );
}

export type { ArmIconName } from "./types/ArmIcon";
