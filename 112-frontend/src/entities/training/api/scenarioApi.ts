import { backendApi } from "@/shared/api";
import type {
  Page,
  ScenarioDetail,
  ScenarioInput,
  ScenarioItem,
} from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get, apiId as id } from "./apiClient";

/** Scenario listing, details and versioned saving. */
export const scenarioApi = {
  list: (params: Params, signal?: AbortSignal) =>
    get<Page<ScenarioItem>>("views/scenarios", params, signal),
  get: (versionId: string, signal?: AbortSignal) =>
    get<ScenarioDetail>(`scenarios/${id(versionId)}`, {}, signal),
  save: (body: ScenarioInput, previousId?: string) =>
    backendApi
      .post(previousId ? `scenarios/${id(previousId)}/versions` : "scenarios", {
        json: body,
      })
      .json<ScenarioDetail>(),
};
