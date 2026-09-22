import RoomOutlinedIcon from "@mui/icons-material/RoomOutlined";
import { useEffect, useMemo, useState } from "react";
import type { GeocodingResponse } from "../types/LocationMapPlaceholder";

import { appConfig } from "@/shared/config/appConfig";

import type {
  GeocodedLocation,
  LocationMapProps,
} from "../types/LocationMapPlaceholderTypes";

const moscow: GeocodedLocation = {
  latitude: 55.751244,
  longitude: 37.618423,
  label: "Москва",
};

const mapSource = (
  { latitude, longitude }: GeocodedLocation,
  marker: boolean,
) => {
  const longitudePadding = 0.015;
  const latitudePadding = 0.009;
  const params = new URLSearchParams({
    bbox: `${longitude - longitudePadding},${latitude - latitudePadding},${longitude + longitudePadding},${latitude + latitudePadding}`,
    layer: "mapnik",
  });
  if (marker) params.set("marker", `${latitude},${longitude}`);

  return `https://www.openstreetmap.org/export/embed.html?${params}`;
};

const normalizeAddress = (addressLine: string) =>
  addressLine.trim().replace(/\s+/g, " ");

export const LocationMap = ({ addressLine }: LocationMapProps) => {
  const address = normalizeAddress(addressLine);
  const [location, setLocation] = useState<GeocodedLocation>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (address.length < 5) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError(false);
      setLocation(undefined);

      try {
        const query = new URLSearchParams({
          format: "jsonv2",
          limit: "1",
          countrycodes: "ru",
          q: `Москва, ${address}`,
        });
        const response = await fetch(`${appConfig.geocodingUrl}?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Geocoding request failed");

        const [match] = (await response.json()) as GeocodingResponse[];
        const latitude = Number(match?.lat);
        const longitude = Number(match?.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("Location not found");
        }

        setLocation({
          latitude,
          longitude,
          label: match.display_name,
        });
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setLocation(undefined);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 600);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [address]);

  const activeLocation = address.length >= 5 ? location : undefined;
  const source = useMemo(
    () => mapSource(activeLocation ?? moscow, Boolean(activeLocation)),
    [activeLocation],
  );
  const status = isLoading
    ? "Ищем адрес на карте…"
    : activeLocation
      ? `Найдена точка: ${activeLocation.label}`
      : error
        ? "Не удалось найти адрес. Показан центр Москвы."
        : "Укажите улицу и дом, чтобы поставить метку.";

  return (
    <section className="location-map" aria-label="Карта происшествия">
      <iframe
        className="location-map__canvas"
        src={source}
        title={
          activeLocation ? `Карта: ${activeLocation.label}` : "Карта Москвы"
        }
      />
      <div className="location-map__address">
        <RoomOutlinedIcon aria-hidden="true" />
        <div>
          <strong>Адрес на карте</strong>
          <span role="status">{status}</span>
        </div>
        <a
          href={
            activeLocation
              ? `https://www.openstreetmap.org/?mlat=${activeLocation.latitude}&mlon=${activeLocation.longitude}#map=17/${activeLocation.latitude}/${activeLocation.longitude}`
              : "https://www.openstreetmap.org/#map=11/55.7512/37.6184"
          }
          rel="noreferrer"
          target="_blank"
        >
          Открыть
        </a>
      </div>
    </section>
  );
};
