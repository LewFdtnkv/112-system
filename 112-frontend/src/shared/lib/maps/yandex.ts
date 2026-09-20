import type { MapPoint } from "../geo";
export type { MapPoint } from "../geo";
type Coordinates = [number, number];
interface Events {
  add(
    name: string,
    callback: (event: { get(key: string): Coordinates }) => void,
  ): void;
}
interface Marker {
  geometry: {
    setCoordinates(coords: Coordinates): void;
    getCoordinates(): Coordinates;
  };
  events: Events;
}
interface MapInstance {
  events: Events;
  geoObjects: { add(marker: Marker): void };
  setCenter(coords: Coordinates): void;
  destroy(): void;
}
interface Yandex {
  ready(callback: () => void): void;
  Map: new (
    element: HTMLElement,
    state: { center: Coordinates; zoom: number; controls: string[] },
  ) => MapInstance;
  Placemark: new (
    coords: Coordinates,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Marker;
}
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
