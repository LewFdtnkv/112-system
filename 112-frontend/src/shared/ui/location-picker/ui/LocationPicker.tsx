import { useCallback, useEffect, useRef, useState } from "react";
import { createPointMap, type MapPoint } from "@/shared/lib/maps/yandex";
import { findAddressAt, findAddresses } from "@/shared/lib/maps/dadata";
import type { GeocodedAddress } from "@/shared/lib/maps/dadata";
import type { LocationPickerProps } from "../types/LocationPicker";
import "../styles/location-picker.scss";

export function LocationPicker({
  initial,
  initialAddress = "",
  readOnly = false,
  onConfirm,
  onCancel,
}: LocationPickerProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Awaited<ReturnType<typeof createPointMap>>>(undefined);
  const lookupVersion = useRef(0);
  const [latitude, setLatitude] = useState(initial?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(
    initial?.longitude.toString() ?? "",
  );
  const [query, setQuery] = useState(initialAddress);
  const [results, setResults] = useState<GeocodedAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<GeocodedAddress>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const lat = Number(latitude.replace(",", "."));
  const lon = Number(longitude.replace(",", "."));
  const valid =
    !!latitude.trim() &&
    !!longitude.trim() &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  const updatePoint = useCallback((point: MapPoint) => {
    setLatitude(point.latitude.toFixed(6));
    setLongitude(point.longitude.toFixed(6));
    setSelectedAddress(undefined);
    const version = ++lookupVersion.current;
    void findAddressAt(point)
      .then((address) => {
        if (!address || version !== lookupVersion.current) return;
        setSelectedAddress(address);
        setQuery(address.addressLine);
      })
      .catch(() => undefined);
  }, []);
  const selectAddress = (address: GeocodedAddress) => {
    lookupVersion.current += 1;
    setSelectedAddress(address);
    setQuery(address.addressLine);
    setResults([]);
    setLatitude(address.point.latitude.toFixed(6));
    setLongitude(address.point.longitude.toFixed(6));
    map.current?.setPoint(address.point);
  };
  const search = async () => {
    const value = query.trim();
    if (!value) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    try {
      const found = await findAddresses(value);
      setResults(found);
      if (!found.length) setSearchError("Адрес не найден. Уточните запрос.");
    } catch {
      setSearchError(
        "Поиск адресов недоступен. Проверьте подключение к DaData или попробуйте позднее.",
      );
    } finally {
      setSearching(false);
    }
  };
  useEffect(() => {
    let disposed = false;
    void createPointMap(host.current!, initial, readOnly, updatePoint)
      .then((instance) => {
        if (disposed) instance?.destroy();
        else {
          map.current = instance;
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить карту. Проверьте подключение к интернету.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      map.current?.destroy();
      map.current = undefined;
    };
  }, [initial, readOnly, retry, updatePoint]);
  return (
    <div className="arm-location-picker">
      {!readOnly && (
        <form
          className="arm-location-search"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <div className="arm-location-search__field">
            <input
              aria-label="Найти адрес"
              placeholder="Например: Москва, Тверская, 1"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedAddress(undefined);
              }}
            />
            {query && (
              <button
                type="button"
                className="arm-location-search__clear"
                aria-label="Очистить поиск"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearchError("");
                }}
              >
                ×
              </button>
            )}
          </div>
          <button
            type="submit"
            className="arm-location-button arm-location-button--primary"
            disabled={!query.trim() || searching}
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
        </form>
      )}

      {!readOnly && (
        <p className="arm-location-hint">
          Введите адрес или выберите точку прямо на карте.
        </p>
      )}
      {searchError && (
        <p className="arm-location-alert" role="alert">
          {searchError}
        </p>
      )}
      {!!results.length && (
        <section className="arm-location-results" aria-label="Найденные адреса">
          <p>Выберите подходящий адрес</p>
          <ul>
            {results.map((address) => (
              <li key={`${address.point.latitude}:${address.point.longitude}`}>
                <button type="button" onClick={() => selectAddress(address)}>
                  <span>{address.addressLine}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedAddress && (
        <div className="arm-location-selected" role="status">
          <span>Выбрано</span>
          <strong>{selectedAddress.addressLine}</strong>
        </div>
      )}

      <div className="arm-location-map-stage">
        {loading && (
          <p className="arm-location-map-status" role="status">
            Загрузка карты…
          </p>
        )}
        {error && (
          <div className="arm-location-map-error" role="alert">
            <strong>Карта недоступна</strong>
            <span>{error}</span>
            <button
              type="button"
              className="arm-location-button"
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              Повторить
            </button>
          </div>
        )}
        <div
          ref={host}
          className="arm-location-canvas"
          aria-label="Карта происшествия"
        />
      </div>

      <footer className="arm-location-actions">
        <p>
          {readOnly
            ? "Точка происшествия из карточки."
            : valid
              ? "Точка готова к применению."
              : "Выберите адрес или точку на карте."}
        </p>
        <div>
          <button
            type="button"
            className="arm-location-button"
            onClick={onCancel}
          >
            {readOnly ? "Закрыть" : "Отмена"}
          </button>
          {!readOnly && (
            <button
              type="button"
              className="arm-location-button arm-location-button--primary"
              disabled={!valid}
              onClick={() =>
                onConfirm({
                  point: { latitude: lat, longitude: lon },
                  address: selectedAddress,
                })
              }
            >
              Применить адрес
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
