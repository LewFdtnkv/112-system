export type PhotoPosition = { x: number; y: number; zoom: number };
export type PhotoCropDialogProps = {
  file: File;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
};
export type PhotoDrag = { pointerId: number; x: number; y: number };
