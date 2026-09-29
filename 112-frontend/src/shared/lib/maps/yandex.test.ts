import { afterEach, expect, it, vi } from "vitest";
import type { MapPoint } from "../geo";

afterEach(() => {
  document.body.replaceChildren();
  delete window.ymaps;
  delete window.SYSTEM112_MAP_CONFIG;
  vi.useRealTimers();
  vi.resetModules();
});
it("places and drags a point, restores a saved location and destroys the map", async () => {
  const { createPointMap } = await import("./yandex");
  const handlers: Record<string, (e: { get: () => [number, number] }) => void> =
    {};
  const destroy = vi.fn();
  let coordinates: [number, number] = [0, 0];
  const marker = {
    geometry: {
      setCoordinates: (p: [number, number]) => {
        coordinates = p;
      },
      getCoordinates: () => coordinates,
    },
    events: {
      add: (key: string, fn: (e: { get: () => [number, number] }) => void) => {
        handlers[key] = fn;
      },
    },
  };
  window.SYSTEM112_MAP_CONFIG = { apiKey: "isolated-test-key" };
  window.ymaps = {
    ready: (fn) => fn(),
    Map: class {
      events = marker.events;
      geoObjects = { add: vi.fn() };
      setCenter = vi.fn();
      destroy = destroy;
    },
    Placemark: class {
      geometry = marker.geometry;
      events = marker.events;
      constructor(p: [number, number]) {
        coordinates = p;
      }
    },
    geocode: async () => ({ geoObjects: { get: () => undefined } }),
  };
  const element = document.createElement("div");
  document.body.append(element);
  const changed = vi.fn<(p: MapPoint) => void>();
  const map = await createPointMap(
    element,
    { latitude: 55, longitude: 37 },
    false,
    changed,
  );
  expect(coordinates).toEqual([55, 37]);
  handlers.click({ get: () => [56, 38] });
  expect(changed).toHaveBeenLastCalledWith({ latitude: 56, longitude: 38 });
  coordinates = [57, 39];
  handlers.dragend({ get: () => coordinates });
  expect(changed).toHaveBeenLastCalledWith({ latitude: 57, longitude: 39 });
  map!.destroy();
  expect(destroy).toHaveBeenCalledOnce();
  delete handlers.click;
  delete handlers.dragend;
  const readOnly = await createPointMap(element, null, true, changed);
  expect(handlers.click).toBeUndefined();
  readOnly!.destroy();
});
it("loads the SDK only on demand and gives a bounded failure if unavailable", async () => {
  vi.useFakeTimers();
  const { loadYandex } = await import("./yandex");
  await expect(loadYandex()).rejects.toThrow("Карта не настроена");
  window.SYSTEM112_MAP_CONFIG = { apiKey: "isolated-test-key" };
  const promise = loadYandex();
  const failure = expect(promise).rejects.toThrow("Не удалось загрузить");
  expect(
    document.querySelector('script[src^="https://api-maps.yandex.ru"]'),
  ).not.toBeNull();
  await vi.advanceTimersByTimeAsync(15000);
  await failure;
  expect(
    document.querySelector('script[src^="https://api-maps.yandex.ru"]'),
  ).toBeNull();
});
