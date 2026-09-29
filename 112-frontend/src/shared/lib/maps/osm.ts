import L, { type LeafletMouseEvent, type Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
// Leaflet's default marker icon references image files by relative URL,
// which Vite doesn't rewrite; import them so the bundler emits and links
// the real asset URLs instead.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import type { MapPoint } from "../geo";

export type { MapPoint } from "../geo";

const markerIconDefault = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const moscow: MapPoint = { latitude: 55.7558, longitude: 37.6173 };

/** Сколько ждать первую плитку, прежде чем считать сеть недоступной. */
const TILE_TIMEOUT_MS = 15000;

/**
 * Тайлы OSM грузятся по сети уже после того, как сама карта
 * инициализировалась, поэтому в отличие от прежней Яндекс.Карт-обёртки
 * здесь нет явного отказа при отсутствии интернета. Ждём первый исход по
 * плиткам первого показа: если ни одна не подтвердилась загрузкой, а хоть
 * одна ошиблась (или все зависли дольше `TILE_TIMEOUT_MS`) — считаем карту
 * недоступной и реджектимся тем же путём, что раньше давал `loadYandex`,
 * чтобы `LocationPicker` не менялся.
 */
function waitForFirstTiles(layer: L.TileLayer): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let loaded = 0;
    let errors = 0;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      layer.off("tileload", onLoad);
      layer.off("tileerror", onError);
      layer.off("load", onAllSettled);
      if (ok) resolve();
      else
        reject(
          new Error(
            "Не удалось загрузить карту. Проверьте подключение к интернету.",
          ),
        );
    };
    const onLoad = () => {
      loaded += 1;
      finish(true);
    };
    const onError = () => {
      errors += 1;
    };
    // `load` — все тайлы первого показа обработаны (успешно или нет).
    const onAllSettled = () => finish(loaded > 0 || errors === 0);
    layer.on("tileload", onLoad);
    layer.on("tileerror", onError);
    layer.on("load", onAllSettled);
    // Подстраховка: если ни `load`, ни `tileerror` не пришли вовсе —
    // например, окно свёрнуто и браузер не грузит скрытые изображения.
    const timer = setTimeout(() => finish(loaded > 0), TILE_TIMEOUT_MS);
  });
}

export async function createPointMap(
  element: HTMLElement,
  initial: MapPoint | null,
  readOnly: boolean,
  onPoint: (p: MapPoint) => void,
) {
  if (!element.isConnected) return undefined;

  const center = initial ?? moscow;
  const map: LeafletMap = L.map(element, {
    center: [center.latitude, center.longitude],
    zoom: initial ? 16 : 12,
    zoomControl: true,
  });
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  try {
    await waitForFirstTiles(tiles);
  } catch (error) {
    map.remove();
    throw error;
  }
  if (!element.isConnected) {
    // Компонент размонтировался, пока мы ждали первую партию тайлов.
    map.remove();
    return undefined;
  }

  let marker: L.Marker | undefined;
  const place = (point: MapPoint) => {
    const latLng: L.LatLngExpression = [point.latitude, point.longitude];
    if (!marker) {
      marker = L.marker(latLng, {
        icon: markerIconDefault,
        draggable: !readOnly,
      }).addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker!.getLatLng();
        onPoint({ latitude: lat, longitude: lng });
      });
    } else {
      marker.setLatLng(latLng);
    }
  };

  if (initial) place(initial);
  if (!readOnly) {
    const onClick = (event: LeafletMouseEvent) => {
      const point = { latitude: event.latlng.lat, longitude: event.latlng.lng };
      place(point);
      onPoint(point);
    };
    map.on("click", onClick);
  }

  // Родительский Dialog монтирует контейнер с нулевым размером и
  // разворачивает его уже после кадра — без пересчёта Leaflet рисует
  // тайлы под старый (нулевой) размер.
  requestAnimationFrame(() => map.invalidateSize());

  return {
    destroy: () => map.remove(),
    setPoint: (point: MapPoint) => {
      place(point);
      map.setView([point.latitude, point.longitude], map.getZoom());
    },
  };
}
