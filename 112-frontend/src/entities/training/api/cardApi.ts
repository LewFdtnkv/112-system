import { backendApi } from "@/shared/api";
import type {
  CardListItem,
  CardTemplate,
  CardTemplateInput,
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  Page,
  Service,
} from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get, apiId as id } from "./apiClient";

/** Authored card API and the classifier data required to create a card. */
export const cardApi = {
  cards: (params: Params, signal?: AbortSignal) =>
    get<Page<CardListItem>>("views/cards", params, signal),
  card: (cardId: string, signal?: AbortSignal) =>
    get<CardTemplate>(`cards/${id(cardId)}`, {}, signal),
  create: (body: CardTemplateInput) =>
    backendApi.post("cards", { json: body }).json<CardTemplate>(),
  update: (cardId: string, body: CardTemplateInput & { revision: number }) =>
    backendApi.put(`cards/${id(cardId)}`, { json: body }).json<CardTemplate>(),
  setGenerationExample: (cardId: string, revision: number, enabled: boolean) =>
    backendApi
      .put(`cards/${id(cardId)}/generation-example`, {
        json: { revision, enabled },
      })
      .json<CardTemplate>(),
  services: (query: string, signal?: AbortSignal) =>
    get<Service[]>("services", { q: query, limit: 20 }, signal),
  classifiers: (query: string, signal?: AbortSignal) =>
    get<Classifier[]>("classifiers", { q: query, limit: 20 }, signal),
  entries: (versionId: string, params: Params, signal?: AbortSignal) =>
    get<ClassifierEntry[]>(
      `classifiers/${id(versionId)}/entries`,
      params,
      signal,
    ),
  routes: (versionId: string, entryId: string, signal?: AbortSignal) =>
    get<ClassifierRoute[]>(
      `classifiers/${id(versionId)}/entries/${id(entryId)}/routes`,
      {},
      signal,
    ),
};
