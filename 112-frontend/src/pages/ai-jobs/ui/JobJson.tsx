import { copyText } from "@/shared/lib/copyText";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Alert, Button, Snackbar } from "@mui/material";
import { useRef, useState } from "react";
import type { JobJsonProps } from "../types";

export function JobJson({ value }: JobJsonProps) {
  const source = useRef<HTMLPreElement>(null);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const text = JSON.stringify(value, null, 2);
  const copy = async () => {
    if (!source.current) return;
    try {
      await copyText(text, source.current);
      setFeedback("success");
    } catch {
      setFeedback("error");
    }
  };

  return (
    <div className="ai-jobs__json-viewer">
      <div className="ai-jobs__json-toolbar">
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={() => void copy()}
          aria-label="Копировать JSON"
        >
          Копировать
        </Button>
      </div>
      <pre ref={source} className="ai-jobs__json" data-selectable>
        {text}
      </pre>
      <Snackbar
        open={feedback !== null}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
      >
        <Alert severity={feedback ?? "success"} onClose={() => setFeedback(null)}>
          {feedback === "error"
            ? "Не удалось скопировать. Выделите JSON и скопируйте вручную."
            : "JSON скопирован в буфер обмена"}
        </Alert>
      </Snackbar>
    </div>
  );
}
