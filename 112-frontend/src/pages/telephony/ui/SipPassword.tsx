import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  Alert,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { copyText } from "@/shared/lib/copyText";

export function SipPassword({ password }: { password: string }) {
  const source = useRef<HTMLSpanElement>(null);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const copy = async () => {
    if (!source.current) return;
    try {
      await copyText(password, source.current);
      setFeedback("success");
    } catch {
      setFeedback("error");
    }
  };
  return (
    <div className="telephony-page__password">
      <Typography className="telephony-page__secret">
        Пароль:{" "}
        <span ref={source} data-selectable>
          {password}
        </span>
      </Typography>
      <Tooltip title="Скопировать пароль">
        <IconButton
          size="small"
          color="inherit"
          aria-label="Скопировать пароль"
          onClick={() => void copy()}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Snackbar
        open={feedback !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setFeedback(null);
        }}
      >
        <Alert
          severity={feedback ?? "success"}
          onClose={() => setFeedback(null)}
        >
          {feedback === "error"
            ? "Не удалось скопировать пароль. Выделите его и скопируйте вручную."
            : "Пароль скопирован"}
        </Alert>
      </Snackbar>
    </div>
  );
}
