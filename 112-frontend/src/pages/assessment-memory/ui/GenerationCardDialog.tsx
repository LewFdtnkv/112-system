import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { cardQueryOptions } from "@/entities/training";
import { CardDetails } from "@/features/card-authoring";
import { GenerationExample } from "@/features/card-generation";
import { TrainingCardPreview } from "@/widgets/incident-card";
import { QueryState } from "@/shared/ui/QueryState";
import type { GenerationCardDialogProps } from "../types/generationMemory";
import "../styles/assessment-memory.scss";

export function GenerationCardDialog({
  id,
  onClose,
}: GenerationCardDialogProps) {
  const detail = useQuery(cardQueryOptions(id));
  const [preview, setPreview] = useState(false);
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="lg"
        aria-labelledby="generation-memory-card-title"
      >
        <DialogTitle id="generation-memory-card-title">
          {detail.data?.title ?? "Пример для генерации"}
        </DialogTitle>
        <DialogContent>
          <QueryState
            pending={detail.isPending}
            error={detail.error}
            retry={() => void detail.refetch()}
          >
            {detail.data && (
              <CardDetails
                card={detail.data}
                onPreview={() => setPreview(true)}
              />
            )}
          </QueryState>
        </DialogContent>
        <DialogActions
          className="generation-memory-card-actions"
          disableSpacing
        >
          {detail.data && <GenerationExample card={detail.data} compact />}
          <Button onClick={onClose}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      {preview && detail.data && (
        <TrainingCardPreview
          reference={detail.data}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
}
