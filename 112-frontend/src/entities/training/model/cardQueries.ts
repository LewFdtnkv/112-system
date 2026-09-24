import { queryOptions } from "@tanstack/react-query";
import { cardApi } from "../api/cardApi";
import { generationApi } from "../api/generationApi";

/** One vocabulary for every cache entry derived from a training card. */
export const cardKeys = {
  all: ["cards"] as const,
  list: (query: string, page: number) => ["cards", query, page] as const,
  detail: (id: string | undefined) => ["card", id] as const,
  options: ["card-options"] as const,
  routes: (versionId: string | undefined, entryId: string | undefined) =>
    ["routes", versionId, entryId] as const,
  generations: ["card-generations"] as const,
  generationPage: (page: number) => ["card-generations", page] as const,
  generationOptions: ["generation-options"] as const,
};

export const cardListQueryOptions = (query: string, page: number) =>
  queryOptions({
    queryKey: cardKeys.list(query, page),
    queryFn: ({ signal }) =>
      cardApi.cards({ q: query, offset: page * 20 }, signal),
    refetchInterval: 5_000,
  });

export const cardQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: cardKeys.detail(id),
    queryFn: ({ signal }) => cardApi.card(id!, signal),
    enabled: !!id,
  });

export const cardGenerationQueryOptions = (page: number) =>
  queryOptions({
    queryKey: cardKeys.generationPage(page),
    queryFn: ({ signal }) => generationApi.jobs(page * 10, signal),
    refetchInterval: 5_000,
  });

export const cardGenerationOptionsQueryOptions = () =>
  queryOptions({
    queryKey: cardKeys.generationOptions,
    queryFn: ({ signal }) => generationApi.options(signal),
  });
