import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounced } from "@/shared/lib/useDebounced";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPointMap, type MapPoint } from "@/shared/lib/maps/yandex";
import { findAddressAt, findAddresses } from "@/shared/lib/maps/dadata";
import type { GeocodedAddress } from "@/shared/lib/maps/dadata";
import type { LocationPickerProps } from "../types/LocationPicker";

export function useLocationPicker(
  host: RefObject<HTMLDivElement | null>,
  { initial, initialAddress = "", readOnly = false }: LocationPickerProps,
) {
  const map = useRef<Awaited<ReturnType<typeof createPointMap>>>(undefined);
  const lookupVersion = useRef(0);
  const [latitude, setLatitude] = useState(initial?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(
    initial?.longitude.toString() ?? "",
  );
  const [query, setQueryValue] = useState(initialAddress);
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const term = useDebounced(query.trim(), 400);
  const searchOptions = (text: string) => ({
    queryKey: ["address-suggestions", text],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      findAddresses(text, signal),
    staleTime: 30_000,
    retry: false as const,
  });
  const suggestions = useQuery({
    ...searchOptions(term),
    enabled: !readOnly && editing && !!term,
  });
  const current = editing && term === query.trim() && !!term;
  const results = current ? (suggestions.data ?? []) : [];
  const searching =
    editing &&
    !!query.trim() &&
    (term !== query.trim() || suggestions.isFetching);
  const searchError =
    current && suggestions.isError
      ? "Поиск адресов недоступен. Попробуйте позднее или укажите точку на карте."
      : current && suggestions.isSuccess && !results.length
        ? "Адрес не найден. Уточните запрос."
        : "";
  const [selectedAddress, setSelectedAddress] = useState<GeocodedAddress>();
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
  const setQuery = (value: string) => {
    lookupVersion.current += 1;
    setQueryValue(value);
    setEditing(true);
    setSelectedAddress(undefined);
  };
  const updatePoint = useCallback((point: MapPoint) => {
    setEditing(false);
    setLatitude(point.latitude.toFixed(6));
    setLongitude(point.longitude.toFixed(6));
    setSelectedAddress(undefined);
    const version = ++lookupVersion.current;
    void findAddressAt(point)
      .then((address) => {
        if (!address || version !== lookupVersion.current) return;
        setSelectedAddress(address);
        setQueryValue(address.addressLine);
      })
      .catch(() => undefined);
  }, []);
  const selectAddress = (address: GeocodedAddress) => {
    lookupVersion.current += 1;
    setSelectedAddress(address);
    setQueryValue(address.addressLine);
    setEditing(false);
    setLatitude(address.point.latitude.toFixed(6));
    setLongitude(address.point.longitude.toFixed(6));
    map.current?.setPoint(address.point);
  };
  const search = () => {
    if (!query.trim()) return;
    setEditing(true);
    void client.prefetchQuery(searchOptions(query.trim()));
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
      lookupVersion.current += 1;
      map.current?.destroy();
      map.current = undefined;
    };
  }, [host, initial, readOnly, retry, updatePoint]);
  return {
    query,
    setQuery,
    results,
    selectedAddress,
    setSelectedAddress,
    searching,
    searchError,
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
  };
}
