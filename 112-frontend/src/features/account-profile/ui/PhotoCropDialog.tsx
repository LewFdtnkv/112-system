import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { PHOTO_SIZE } from "../lib/photoCrop";
import { usePhotoCrop } from "../model/usePhotoCrop";
import type { PhotoCropDialogProps } from "../types/photoCrop";
import "../styles/photo-crop.scss";

export function PhotoCropDialog(props: PhotoCropDialogProps) {
  const {
    canvas,
    image,
    position,
    error,
    saving,
    save,
    reset,
    zoom,
    onPointerDown,
    onPointerMove,
    onKeyDown,
    endDrag,
  } = usePhotoCrop(props);
  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      aria-labelledby="photo-crop-title"
      onClose={saving ? undefined : props.onClose}
    >
      <DialogTitle id="photo-crop-title">Настроить фотографию</DialogTitle>
      <DialogContent>
        <Stack spacing={2} className="photo-crop">
          <Typography id="photo-crop-help">
            Переместите фото и измените масштаб, чтобы лицо целиком поместилось
            в круг.
          </Typography>
          {!image && !error && (
            <CircularProgress aria-label="Открытие фотографии" />
          )}
          <canvas
            ref={canvas}
            width={PHOTO_SIZE}
            height={PHOTO_SIZE}
            hidden={!image}
            className="photo-crop__preview"
            role="img"
            tabIndex={saving ? -1 : 0}
            aria-label="Предпросмотр фотографии. Перемещение стрелками клавиатуры или перетаскиванием"
            aria-describedby="photo-crop-help"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={onKeyDown}
          />
          <div className="photo-crop__scale">
            <Typography id="photo-crop-scale">Масштаб</Typography>
            <Slider
              aria-labelledby="photo-crop-scale"
              min={0.5}
              max={3}
              step={0.01}
              value={position.zoom}
              disabled={!image || saving}
              onChange={(_, value) => zoom(value as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            />
          </div>
          <Button disabled={!image || saving} onClick={reset}>
            Сбросить положение и масштаб
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions className="photo-crop__actions">
        <Button disabled={saving} onClick={props.onClose}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={!image || saving}
          onClick={() => void save()}
        >
          {saving ? "Сохранение…" : "Сохранить фотографию"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
