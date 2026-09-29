import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MapPoint } from "@/shared/lib/geo";
import { useLocationPicker } from "./useLocationPicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

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
  const client = new QueryClient();
  const { result, unmount } = renderHook(
    () =>
      useLocationPicker(host, {
        initial: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
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

it("suggests after typing and discards a late response for the previous query", async () => {
  mocks.createMap.mockResolvedValue({ destroy: vi.fn(), setPoint: vi.fn() });
  let finishOld!: (value: unknown[]) => void;
  const old = new Promise<unknown[]>((resolve) => {
    finishOld = resolve;
  });
  const address = {
    addressLine: "Москва, Тверская улица",
    point: { latitude: 55.7, longitude: 37.6 },
    country: "Россия",
    administrativeAreas: [],
    localities: ["Москва"],
    district: "",
    area: "",
    street: "Тверская улица",
    house: "",
    building: "",
    structure: "",
    apartment: "",
  };
  mocks.search.mockImplementation((term) =>
    term === "Москва, Ар" ? old : Promise.resolve([address]),
  );
  const client = new QueryClient();
  const host = { current: document.createElement("div") };
  const { result } = renderHook(
    () =>
      useLocationPicker(host, {
        initial: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  act(() => result.current.setQuery("Москва, Ар"));
  await waitFor(() =>
    expect(mocks.search).toHaveBeenCalledWith(
      "Москва, Ар",
      expect.any(AbortSignal),
    ),
  );
  act(() => result.current.setQuery("Москва, Твер"));
  await waitFor(() =>
    expect(result.current.results[0]?.addressLine).toBe(address.addressLine),
  );
  await act(async () =>
    finishOld([{ ...address, addressLine: "Старый адрес" }]),
  );
  expect(result.current.results[0].addressLine).toBe(address.addressLine);
  act(() => result.current.selectAddress(address));
  expect(result.current.results).toEqual([]);
  expect(result.current.selectedAddress).toEqual(address);
  act(() => result.current.setQuery(""));
  expect(result.current.results).toEqual([]);
  expect(result.current.searchError).toBe("");
});
