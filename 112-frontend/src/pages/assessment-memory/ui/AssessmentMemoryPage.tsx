import { Tab, Tabs, Stack } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/shared/ui/PageHeader";
import { AssessmentExamples } from "./AssessmentExamples";
import { GenerationMemory } from "./GenerationMemory";

export function AssessmentMemoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "generation" ? "generation" : "assessment";
  return (
    <Stack spacing={2}>
      <PageHeader
        title="Память ИИ"
        description="Примеры для проверки ответов и создания учебных карточек"
      />
      <Tabs
        value={tab}
        onChange={(_, value) => setParams({ tab: value })}
        aria-label="Назначение памяти ИИ"
      >
        <Tab
          value="assessment"
          label="Оценивание"
          id="memory-assessment"
          aria-controls="memory-panel"
        />
        <Tab
          value="generation"
          label="Генерация карточек"
          id="memory-generation"
          aria-controls="memory-panel"
        />
      </Tabs>
      <div role="tabpanel" id="memory-panel" aria-labelledby={`memory-${tab}`}>
        {tab === "assessment" ? <AssessmentExamples /> : <GenerationMemory />}
      </div>
    </Stack>
  );
}
