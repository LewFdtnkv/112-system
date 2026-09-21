export type Coordinates = [number, number];

export interface Events {
  add(
    name: string,
    callback: (event: { get(key: string): Coordinates }) => void,
  ): void;
}

export interface Marker {
  geometry: {
    setCoordinates(coords: Coordinates): void;
    getCoordinates(): Coordinates;
  };
  events: Events;
}

export interface MapInstance {
  events: Events;
  geoObjects: { add(marker: Marker): void };
  setCenter(coords: Coordinates): void;
  destroy(): void;
}

export interface Yandex {
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
