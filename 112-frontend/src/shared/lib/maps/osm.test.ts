import "@testing-library/jest-dom/vitest";

import { afterEach, expect, it, vi } from "vitest";

import { createPointMap } from "./osm";

function mountContainer() {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(element, "clientHeight", {
    value: 300,
    configurable: true,
  });
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;
  document.body.append(element);
  return element;
}

function clickAt(element: HTMLElement, clientX: number, clientY: number) {
  element.dispatchEvent(
    new MouseEvent("click", { clientX, clientY, bubbles: true }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

it("places a marker for the initial point and centers on it", async () => {
  const element = mountContainer();
  const map = await createPointMap(
    element,
    { latitude: 55, longitude: 37 },
    false,
    vi.fn(),
  );

  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

  map!.destroy();
});

it("click reports coordinates and places a marker when there was none", async () => {
  const element = mountContainer();
  const onPoint = vi.fn();
  const map = await createPointMap(element, null, false, onPoint);

  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(0);
  clickAt(element, 200, 150);

  expect(onPoint).toHaveBeenCalledTimes(1);
  const [point] = onPoint.mock.calls[0] as [
    { latitude: number; longitude: number },
  ];
  expect(point.latitude).toBeGreaterThan(50);
  expect(point.latitude).toBeLessThan(60);
  expect(point.longitude).toBeGreaterThan(30);
  expect(point.longitude).toBeLessThan(45);
  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

  map!.destroy();
});

it("a second click moves the existing marker instead of adding another", async () => {
  const element = mountContainer();
  const onPoint = vi.fn();
  const map = await createPointMap(element, null, false, onPoint);

  clickAt(element, 200, 150);
  clickAt(element, 260, 150);

  expect(onPoint).toHaveBeenCalledTimes(2);
  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

  map!.destroy();
});

it("readOnly: clicks do nothing and the marker is not draggable", async () => {
  const element = mountContainer();
  const onPoint = vi.fn();
  const map = await createPointMap(
    element,
    { latitude: 55, longitude: 37 },
    true,
    onPoint,
  );

  clickAt(element, 200, 150);

  expect(onPoint).not.toHaveBeenCalled();
  expect(
    element.querySelector(".leaflet-marker-draggable"),
  ).not.toBeInTheDocument();

  map!.destroy();
});

it("setPoint moves the view and marker without user interaction", async () => {
  const element = mountContainer();
  const map = await createPointMap(element, null, false, vi.fn());

  map!.setPoint({ latitude: 10, longitude: 20 });

  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

  map!.destroy();
});

it("destroy tears the map down so later clicks are inert", async () => {
  const element = mountContainer();
  const onPoint = vi.fn();
  const map = await createPointMap(
    element,
    { latitude: 55, longitude: 37 },
    false,
    onPoint,
  );

  map!.destroy();

  expect(element.querySelectorAll(".leaflet-marker-icon")).toHaveLength(0);
  clickAt(element, 200, 150);
  expect(onPoint).not.toHaveBeenCalled();
});

it("skips setup entirely if the container was already unmounted", async () => {
  const element = document.createElement("div"); // never appended
  const map = await createPointMap(element, null, false, vi.fn());

  expect(map).toBeUndefined();
});
