import { Avatar } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import { useUserPhoto } from "../model/useUserPhoto";
import { styles } from "../styles/UserPhoto";
import type { UserPhotoProps } from "../types/UserPhoto";

export function UserPhoto({
  userId,
  size = "profile",
  decorative = false,
}: UserPhotoProps) {
  const photo = useUserPhoto(userId);
  return (
    <Avatar
      src={photo.isError ? undefined : (photo.data ?? undefined)}
      alt={decorative ? "" : "Фотография пользователя"}
      aria-hidden={decorative || undefined}
      sx={size === "small" ? styles.small : styles.avatar}
    >
      <PersonIcon fontSize={size === "small" ? "small" : "large"} />
    </Avatar>
  );
}
