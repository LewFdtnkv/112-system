import { createPointMap } from "@/shared/lib/maps/yandex";
import { useEffect, useRef, useState } from "react";
import "../styles/location-picker.scss";
import type { LocationPickerProps } from "../types/LocationPicker";
export function LocationPicker({
  initial,
  readOnly = false,
  onConfirm,
  onCancel,
}: LocationPickerProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Awaited<ReturnType<typeof createPointMap>>>(undefined);
  const [latitude, setLatitude] = useState(initial?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(
    initial?.longitude.toString() ?? "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const lat = Number(latitude.replace(",", ".")),
    lon = Number(longitude.replace(",", "."));
  const valid =
    !!latitude.trim() &&
    !!longitude.trim() &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  useEffect(() => {
    let disposed = false;
    void createPointMap(host.current!, initial, readOnly, (p) => {
      setLatitude(p.latitude.toFixed(6));
      setLongitude(p.longitude.toFixed(6));
    })
      .then((instance) => {
        if (disposed) instance?.destroy();
        else {
          map.current = instance;
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(e instanceof Error ? e.message : "Карта недоступна");
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      map.current?.destroy();
      map.current = undefined;
    };
  }, [initial, readOnly, retry]);
  return (
    <div className="arm-location-picker">
      <div className="arm-location-toolbar">
        <input
          aria-label="Широта"
          placeholder="Широта"
          inputMode="decimal"
          value={latitude}
          readOnly={readOnly}
          onChange={(e) => setLatitude(e.target.value)}
        />
        <input
          aria-label="Долгота"
          placeholder="Долгота"
          inputMode="decimal"
          value={longitude}
          readOnly={readOnly}
          onChange={(e) => setLongitude(e.target.value)}
        />
        {!readOnly && (
          <button
            disabled={!valid}
            onClick={() => onConfirm({ latitude: lat, longitude: lon })}
          >
            ОК
          </button>
        )}
        <button
          disabled={!valid || !!error || loading}
          onClick={() =>
            map.current?.setPoint({ latitude: lat, longitude: lon })
          }
        >
          Показать точку
        </button>
        <button onClick={onCancel}>{readOnly ? "Закрыть" : "Отмена"}</button>
      </div>
      <p>
        {readOnly
          ? "Точка происшествия из карточки."
          : "Укажите точку щелчком по карте и нажмите «ОК». Метку можно перетаскивать."}
      </p>
      {loading && <p role="status">Загрузка карты…</p>}
      {error && (
        <div role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((v) => v + 1);
            }}
          >
            Повторить
          </button>
          <p>Можно указать известные координаты в полях выше.</p>
        </div>
      )}
      <div
        ref={host}
        className="arm-location-canvas"
        aria-label="Карта происшествия"
      />
    </div>
  );
}
