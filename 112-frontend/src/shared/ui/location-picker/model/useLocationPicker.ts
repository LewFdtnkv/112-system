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
  }, [host, initial, readOnly, retry, updatePoint]);
  return {
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
  };
}
