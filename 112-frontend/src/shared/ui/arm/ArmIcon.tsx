import Phone from "@mui/icons-material/LocalPhone";
import CallEnd from "@mui/icons-material/CallEnd";
import Sms from "@mui/icons-material/Sms";
import Map from "@mui/icons-material/Map";
import Language from "@mui/icons-material/Language";
import Help from "@mui/icons-material/HelpOutlineOutlined";
import Link from "@mui/icons-material/AddLink";
import Timer from "@mui/icons-material/TimerOutlined";
import Hand from "@mui/icons-material/PanTool";
import Bell from "@mui/icons-material/NotificationsActive";
import Comment from "@mui/icons-material/Announcement";
import Close from "@mui/icons-material/Close";
import Plus from "@mui/icons-material/Add";
import Down from "@mui/icons-material/KeyboardArrowDown";
import Up from "@mui/icons-material/KeyboardArrowUp";
import Left from "@mui/icons-material/ChevronLeft";
import Right from "@mui/icons-material/ChevronRight";
import Search from "@mui/icons-material/Search";
import Pin from "@mui/icons-material/LocationOff";
import Bookmark from "@mui/icons-material/Bookmark";
import Bolt from "@mui/icons-material/Bolt";
import Clipboard from "@mui/icons-material/Assignment";
import Settings from "@mui/icons-material/Settings";
import Monitor from "@mui/icons-material/DesktopWindows";
import Logout from "@mui/icons-material/Logout";
import Translate from "@mui/icons-material/Translate";
import Edit from "@mui/icons-material/Edit";
import type { ButtonHTMLAttributes } from "react";

const icons = {
  phone: Phone,
  callEnd: CallEnd,
  sms: Sms,
  map: Map,
  globe: Language,
  help: Help,
  link: Link,
  timer: Timer,
  hand: Hand,
  bell: Bell,
  comment: Comment,
  close: Close,
  plus: Plus,
  down: Down,
  up: Up,
  left: Left,
  right: Right,
  search: Search,
  pin: Pin,
  bookmark: Bookmark,
  bolt: Bolt,
  clipboard: Clipboard,
  settings: Settings,
  monitor: Monitor,
  logout: Logout,
  translate: Translate,
  edit: Edit,
};
export type ArmIconName = keyof typeof icons;
export function ArmIcon({ name }: { name: ArmIconName }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" fontSize="inherit" />;
}
export function ArmIconButton({
  icon,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ArmIconName;
  label: string;
}) {
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
