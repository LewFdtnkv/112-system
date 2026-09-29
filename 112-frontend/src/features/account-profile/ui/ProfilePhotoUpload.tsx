import { useState } from "react";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { Alert, Button, Typography } from "@mui/material";
import { UserPhoto } from "@/entities/user";
import { getApiError } from "@/shared/api";
import { useProfilePhoto } from "../model/useProfilePhoto";
import type { ProfilePhotoProps } from "../types/profile";
export function ProfilePhotoUpload(props: ProfilePhotoProps) {
  const upload = useProfilePhoto(props);
  const [photo, setPhoto] = useState<File | null>(null);
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
            if (file) {
              upload.reset();
              setPhoto(file);
            }
            event.target.value = "";
          }}
        />
      </Button>
      <Typography variant="caption">
        PNG или JPEG, до 1 МБ. Перед сохранением можно настроить положение и
        масштаб.
      </Typography>
      {photo && (
        <PhotoCropDialog
          file={photo}
          onClose={() => setPhoto(null)}
          onSave={async (file) => {
            await upload.mutateAsync(file);
            setPhoto(null);
          }}
        />
      )}
      {upload.error && (
        <Alert severity="error">{getApiError(upload.error).message}</Alert>
      )}
      {upload.isSuccess && (
        <Alert severity="success">Фотография обновлена</Alert>
      )}
    </>
  );
}
