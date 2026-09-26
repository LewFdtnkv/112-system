import { useState } from "react";
import CallOutlined from "@mui/icons-material/CallOutlined";
import { audioStatusLabels } from "@/entities/telephony";
import type { TelephoneContactsProps } from "../types/telephoneContacts";

export function TelephoneContacts({
  cues,
  mode,
  crewCallsRequired,
  ready,
  busy,
  onStart,
}: TelephoneContactsProps) {
  const [selected, setSelected] = useState("");
  const key = (cue: (typeof cues)[number]) =>
    `${cue.id}:${cue.crew_code ?? ""}`;
  const cue = cues.find((c) => key(c) === selected) ?? cues[0];
  if (!cue) return null;
  const name = (c: typeof cue) =>
    c.crew_name ? `${c.crew_name} · ${c.name}` : c.name;
  return (
    <div className="training-telephone__contacts">
      {cues.length > 1 ? (
        <select
          aria-label="Кому позвонить"
          value={key(cue)}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
        >
          {cues.map((c) => (
            <option key={key(c)} value={key(c)}>
              {name(c)}
            </option>
          ))}
        </select>
      ) : (
        <span>{name(cue)}</span>
      )}
      {cue.status !== "ready" && <small>{audioStatusLabels[cue.status]}</small>}
      <button
        className="arm-small-button"
        disabled={
          !ready || busy || (mode !== "external" && cue.status !== "ready")
        }
        onClick={() =>
          onStart({
            cue_id: cue.id,
            crew_code: cue.crew_code,
            direction: "outgoing",
            transport: "manual",
          })
        }
      >
        <CallOutlined aria-hidden="true" />
        {mode === "browser" ? "Позвонить" : "Выбрать контакт"}
      </button>
      {mode !== "external" && !crewCallsRequired && (
        <button
          className="arm-small-button"
          disabled={!ready || busy || cue.status !== "ready"}
          onClick={() =>
            onStart({
              cue_id: cue.id,
              crew_code: cue.crew_code,
              direction: "incoming",
              transport: "callback",
            })
          }
        >
          Вызвать меня
        </button>
      )}
    </div>
  );
}
