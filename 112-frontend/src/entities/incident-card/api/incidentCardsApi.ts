import { api, apiEndpoints } from "@/shared/api";

import type { IncidentCard, IncidentCardFields } from "../model/types";

export const incidentCardsApi = {
  list: (sessionId: string) =>
    api.get(apiEndpoints.sessions.cards(sessionId)).json<IncidentCard[]>(),
  create: (sessionId: string, card: IncidentCard) =>
    api
      .post(apiEndpoints.sessions.cards(sessionId), { json: card })
      .json<IncidentCard>(),
  update: (cardId: string, fields: IncidentCardFields) =>
    api
      .patch(apiEndpoints.incidentCards.detail(cardId), { json: { fields } })
      .json<IncidentCard>(),
  addAction: (cardId: string, action: string) =>
    api
      .post(apiEndpoints.incidentCards.actions(cardId), { json: { action } })
      .json<{ action: string; log: string[] }>(),
  submit: (cardId: string) =>
    api
      .post(apiEndpoints.incidentCards.submit(cardId))
      .json<{ card: IncidentCard; log: string[] }>(),
};
