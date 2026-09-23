import { useRef } from "react";
import { useLocationPicker } from "../model/useLocationPicker";
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
  const {
    query,
    setQuery,
    results,
    setResults,
    selectedAddress,
    setSelectedAddress,
    searching,
    searchError,
    setSearchError,
    error,
    setError,
    loading,
    setLoading,
    setRetry,
    lat,
    lon,
    valid,
    search,
    selectAddress,
  } = useLocationPicker(host, {
    initial,
    initialAddress,
    readOnly,
    onConfirm,
    onCancel,
  });
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
