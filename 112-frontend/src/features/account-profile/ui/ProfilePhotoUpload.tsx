import { Alert, Button, Typography } from "@mui/material";
import { UserPhoto } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { useProfilePhoto } from "../model/useProfilePhoto";
import type { ProfilePhotoProps } from "../types/profile";
export function ProfilePhotoUpload(props: ProfilePhotoProps) {
  const upload = useProfilePhoto(props);
  return (
    <>
      <UserPhoto userId={props.userId} />
      <Button component="label" disabled={upload.isPending}>
        {upload.isPending ? "Загрузка фотографии…" : "Загрузить фотографию"}
        <input
          type="file"
          hidden
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
      </Button>
      <Typography variant="caption">
        PNG или JPEG, до 2 МБ. Фотография сохраняется сразу.
      </Typography>
      {upload.error && (
        <Alert severity="error">{getApiError(upload.error).message}</Alert>
      )}
      {upload.isSuccess && (
        <Alert severity="success">Фотография обновлена</Alert>
      )}
    </>
  );
}
