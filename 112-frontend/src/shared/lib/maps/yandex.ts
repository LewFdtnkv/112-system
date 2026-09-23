import type {
  Coordinates,
  GeocodedObject,
  Marker,
  Yandex,
} from "../../types/yandex";
import type { MapPoint } from "../geo";
import type { GeocodedAddress } from "./types/GeocodedAddress";
export type { MapPoint } from "../geo";
export type { GeocodedAddress } from "./types/GeocodedAddress";
declare global {
  interface Window {
    ymaps?: Yandex;
    SYSTEM112_MAP_CONFIG?: { apiKey?: string };
  }
}
let loading: Promise<Yandex> | undefined;
export function loadYandex(): Promise<Yandex> {
  const key =
    window.SYSTEM112_MAP_CONFIG?.apiKey ||
    import.meta.env.VITE_YANDEX_MAPS_API_KEY;
  if (!key)
    return Promise.reject(
      new Error(
        "Карта не настроена. Обратитесь к администратору для подключения Яндекс.Карт.",
      ),
    );
  if (loading) return loading;
  loading = new Promise<Yandex>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          "Не удалось загрузить Яндекс.Карты. Проверьте подключение к интернету и настройки карты.",
        ),
      );
    };
    const timer = setTimeout(fail, 15000);
    const ready = () =>
      window.ymaps?.ready(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(window.ymaps!);
      });
    if (window.ymaps) ready();
    else {
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${encodeURIComponent(key)}`;
      script.async = true;
      script.onload = ready;
      script.onerror = fail;
      document.head.append(script);
    }
  }).catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

const toAddress = (result: GeocodedObject): GeocodedAddress => {
  const [latitude, longitude] = result.geometry.getCoordinates();
  return {
    point: { latitude, longitude },
    addressLine: result.getAddressLine(),
    country: result.getCountry(),
    administrativeAreas: result.getAdministrativeAreas(),
    localities: result.getLocalities(),
    district: "",
    area: "",
    street: result.getThoroughfare(),
    house: result.getPremiseNumber(),
    building: "",
    structure: "",
    apartment: "",
  };
};

/** Выполняет запрос только по явному действию пользователя. */
export async function findAddresses(query: string): Promise<GeocodedAddress[]> {
  const api = await loadYandex();
  const response = await api.geocode(query, { results: 5 });
  return Array.from({ length: 5 }, (_, index) => response.geoObjects.get(index))
    .filter((result): result is GeocodedObject => !!result)
    .map(toAddress);
}

export async function findAddressAt(
  point: MapPoint,
): Promise<GeocodedAddress | undefined> {
  const api = await loadYandex();
  const response = await api.geocode([point.latitude, point.longitude], {
    results: 1,
  });
  const result = response.geoObjects.get(0);
  return result ? toAddress(result) : undefined;
}
export async function createPointMap(
  element: HTMLElement,
  initial: MapPoint | null,
  readOnly: boolean,
  onPoint: (p: MapPoint) => void,
) {
  const api = await loadYandex();
  if (!element.isConnected) return undefined;
  const coords: Coordinates = initial
    ? [initial.latitude, initial.longitude]
    : [55.7558, 37.6173];
  const map = new api.Map(element, {
    center: coords,
    zoom: initial ? 16 : 12,
    controls: ["zoomControl", "typeSelector"],
  });
  let marker: Marker | undefined;
  const place = (c: Coordinates) => {
    if (!marker) {
      marker = new api.Placemark(
        c,
        {},
        { draggable: !readOnly, preset: "islands#redDotIcon" },
      );
      map.geoObjects.add(marker);
      marker.events.add("dragend", () => {
        const [latitude, longitude] = marker!.geometry.getCoordinates();
        onPoint({ latitude, longitude });
      });
    } else marker.geometry.setCoordinates(c);
  };
  if (initial) place(coords);
  if (!readOnly)
    map.events.add("click", (e) => {
      const c = e.get("coords");
      place(c);
      onPoint({ latitude: c[0], longitude: c[1] });
    });
  return {
    destroy: () => map.destroy(),
    setPoint: (p: MapPoint) => {
      const c: Coordinates = [p.latitude, p.longitude];
      place(c);
      map.setCenter(c);
    },
  };
}
