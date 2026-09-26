import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { userApi } from "@/entities/training";
import { QueryState } from "@/shared/ui/QueryState";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { ProfilePhotoUpload } from "./ProfilePhotoUpload";
import { ProfileFields } from "./ProfileFields";
import { useProfileForm } from "../model/useProfileForm";
import type { ProfileDialogProps, ProfileFormProps } from "../types/profile";
import "../styles/profile.scss";
export function AccountProfileDialog({ onClose }: ProfileDialogProps) {
  const query = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => userApi.me(),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="own-profile-title"
    >
      <DialogTitle id="own-profile-title">Мой профиль</DialogTitle>
      <DialogContent>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data && <ProfileForm user={query.data} onClose={onClose} />}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
function ProfileForm(props: ProfileFormProps) {
  const { value, setValue, save } = useProfileForm(props);
  return (
    <ValidatedForm
      className="account-profile-form"
      spacing={2}
      error={save.error}
      onSubmit={() => save.mutate()}
    >
      <Typography>Логин: {props.user.username}</Typography>
      <ProfilePhotoUpload userId={props.user.id} own />
      <ProfileFields value={value} onChange={setValue} />
      <Button type="submit" variant="contained" disabled={save.isPending}>
        Сохранить изменения
      </Button>
      <Button onClick={props.onClose} disabled={save.isPending}>
        Закрыть
      </Button>
    </ValidatedForm>
  );
}
