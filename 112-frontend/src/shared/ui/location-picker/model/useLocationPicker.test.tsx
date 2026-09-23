import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MapPoint } from "@/shared/lib/geo";
import { useLocationPicker } from "./useLocationPicker";

const mocks = vi.hoisted(() => ({
  reverse: vi.fn(),
  search: vi.fn(),
  createMap: vi.fn(),
}));
vi.mock("@/shared/lib/maps/yandex", () => ({
  createPointMap: mocks.createMap,
}));
vi.mock("@/shared/lib/maps/dadata", () => ({
  findAddressAt: mocks.reverse,
  findAddresses: mocks.search,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("ignores late reverse geocoding after the user edits the search", async () => {
  let selectPoint!: (point: MapPoint) => void;
  let finish!: (address: unknown) => void;
  const destroy = vi.fn();
  mocks.createMap.mockImplementation(
    async (_host, _initial, _readOnly, onPoint) => {
      selectPoint = onPoint;
      return { destroy, setPoint: vi.fn() };
    },
  );
  mocks.reverse.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = { current: document.createElement("div") };
  const { result, unmount } = renderHook(() =>
    useLocationPicker(host, {
      initial: null,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => selectPoint({ latitude: 55.7, longitude: 37.6 }));
  act(() => result.current.setQuery("Новый адрес"));
  await act(async () => finish({ addressLine: "Старый адрес" }));
  expect(result.current.query).toBe("Новый адрес");
  expect(result.current.selectedAddress).toBeUndefined();
  expect(result.current.lat).toBe(55.7);
  unmount();
  expect(destroy).toHaveBeenCalledOnce();
});
