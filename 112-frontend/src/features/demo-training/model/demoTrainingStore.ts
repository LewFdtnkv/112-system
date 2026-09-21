import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DemoTrainingState } from "../types/demoTrainingStore";

import { evaluateIncidentCard } from "./evaluateIncidentCard";
import { demoEvaluations } from "./evaluationIndex";

import { demoSessions } from "@/entities/training-session";

const initialState = () => ({
  sessions: structuredClone(demoSessions),
  evaluations: structuredClone(demoEvaluations),
});

export const useDemoTrainingStore = create<DemoTrainingState>()(
  persist(
    (set, get) => ({
      ...initialState(),
      startSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId && session.status !== "completed"
              ? { ...session, status: "active" }
              : session,
          ),
        })),
      completeSession: (input) => {
        const session = get().sessions.find(
          (item) => item.id === input.sessionId,
        );
        if (!session || session.status === "completed") return null;

        const evaluation = evaluateIncidentCard(input);
        set((state) => ({
          sessions: state.sessions.map((item) =>
            item.id === input.sessionId
              ? { ...item, status: "completed" }
              : item,
          ),
          evaluations: [
            ...state.evaluations.filter(
              (item) => item.sessionId !== input.sessionId,
            ),
            evaluation,
          ],
        }));
        return evaluation;
      },
      reset: () => set(initialState()),
    }),
    {
      name: "dds112-training",
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        evaluations: state.evaluations,
      }),
    },
  ),
);
