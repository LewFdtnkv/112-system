import { ArmIcon } from "@/shared/ui/arm";
import { useEffect, useState } from "react";
export function JournalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const date = now
    .toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(" г.", "");
  return (
    <div className="arm-journal-clock">
      <div>
        <strong>{date}</strong>
        <small>
          УМЦ, учебный контур <ArmIcon name="monitor" />{" "}
          <ArmIcon name="settings" /> <ArmIcon name="help" />
        </small>
      </div>
      <time dateTime={now.toISOString()}>
        {now.toLocaleTimeString("ru-RU", {
          timeZone: "Europe/Moscow",
          hour: "2-digit",
          minute: "2-digit",
        })}
        <sup>:{String(now.getSeconds()).padStart(2, "0")}</sup>
      </time>
    </div>
  );
}
