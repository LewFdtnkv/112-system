import { backendApi } from "@/shared/api/backendApi";

import type { MapPoint } from "../geo";
import type { GeocodedAddress } from "./types/GeocodedAddress";
import type { AddressSearchResponse } from "./types/Dadata";

export type { GeocodedAddress } from "./types/GeocodedAddress";

/** Адресный поиск выполняется backend-прокси, чтобы токен DaData не попадал в браузер. */
export async function findAddresses(query: string): Promise<GeocodedAddress[]> {
  const result = await backendApi
    .post("addresses/suggest", { json: { query, count: 5 } })
    .json<AddressSearchResponse>();
  return result.items;
}

export async function findAddressAt(
  point: MapPoint,
): Promise<GeocodedAddress | undefined> {
  const result = await backendApi
    .post("addresses/reverse", { json: { ...point, count: 1 } })
    .json<AddressSearchResponse>();
  return result.items[0];
}
