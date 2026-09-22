import { Avatar } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { activityApi } from "../api/activityApi";
import { styles } from "../styles/UserPhoto";
import type { UserPhotoProps } from "../types/UserPhoto";

export function UserPhoto({ userId }: UserPhotoProps) {
  const photo = useQuery({
    queryKey: ["user-photo", userId],
    queryFn: () => activityApi.photo(userId),
  });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!photo.data?.size) return;
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(photo.data);
    return () => {
      reader.onload = null;
      reader.abort();
    };
  }, [photo.data]);
  return <Avatar src={url} alt="Фотография пользователя" sx={styles.avatar} />;
}
