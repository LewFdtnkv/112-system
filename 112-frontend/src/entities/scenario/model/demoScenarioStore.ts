import { randomUUID } from "@/shared/lib/uuid";
import { create } from "zustand";
import type { DemoScenarioStore } from "../types/demoScenarioStore";

import { demoScenarios } from "./demoScenarios";

export const useDemoScenarioStore = create<DemoScenarioStore>()((set, get) => ({
  scenarios: demoScenarios.map((scenario) => ({ ...scenario })),
  createScenario: (draft) => {
    const id = `demo-scenario-${randomUUID()}`;
    set((state) => ({ scenarios: [...state.scenarios, { ...draft, id }] }));
    return id;
  },
  updateScenario: (id, draft) => {
    if (!get().scenarios.some((scenario) => scenario.id === id)) return false;

    set((state) => ({
      scenarios: state.scenarios.map((scenario) =>
        scenario.id === id ? { ...draft, id } : scenario,
      ),
    }));
    return true;
  },
  upsertScenario: (scenario) =>
    set((state) => ({
      scenarios: state.scenarios.some((item) => item.id === scenario.id)
        ? state.scenarios.map((item) =>
            item.id === scenario.id ? scenario : item,
          )
        : [...state.scenarios, scenario],
    })),
}));
