import { backendApi } from "@/shared/api";
import type {
  CardListItem,
  CardTemplate,
  CardTemplateInput,
  Page,
} from "../model/types";
import type { Params } from "@/shared/types/query";
import { apiGet as get, apiId as id } from "@/shared/api/apiClient";

/** Authored card API. */
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
};
