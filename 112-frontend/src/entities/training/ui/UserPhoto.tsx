import { useEffect, useState } from "react";
import { Avatar } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "../api/activityApi";

export function UserPhoto({ userId }: { userId: string }) {
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
  return (
    <Avatar
      src={url}
      alt="Фотография пользователя"
      sx={{ width: 80, height: 80 }}
    />
  );
}
