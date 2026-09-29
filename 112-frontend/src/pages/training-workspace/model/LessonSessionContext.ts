import { createContext, useContext } from "react";
import type { LessonSession } from "../types/LessonSession";

export const LessonSessionContext = createContext<LessonSession | null>(null);
export const useLessonSession = () => useContext(LessonSessionContext);
