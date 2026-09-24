"""Learning intent is separate from role, scenario difficulty and measured performance."""

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LessonKind(StrEnum):
    INTRODUCTION = "introduction"
    WORKED_EXAMPLE = "worked_example"
    SKILL_PRACTICE = "skill_practice"
    PRACTICE = "practice"
    ASSESSMENT = "assessment"
    REVIEW = "review"


class LearningSkill(StrEnum):
    INTERFACE = "interface"
    ADDRESS = "address"
    CALLER = "caller"
    CLASSIFICATION = "classification"
    NOTIFICATION = "notification"
    DESCRIPTION = "description"
    DDS_RESPONSE = "dds_response"
    DDS_CREWS = "dds_crews"


class AssistancePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_level: Literal["none", "goal", "explanation", "solution"] = "none"
    on_request: bool = True


class LearningPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["learning-v2"] = "learning-v2"
    kind: LessonKind = LessonKind.PRACTICE
    objective: str = Field(default="", max_length=2000)
    target_skills: list[LearningSkill] = Field(default_factory=list, max_length=8)
    assistance: AssistancePolicy = Field(default_factory=AssistancePolicy)

    @model_validator(mode="after")
    def coherent(self):
        if len(self.target_skills) != len(set(self.target_skills)):
            raise ValueError("Target skills must not repeat")
        if self.kind in (LessonKind.SKILL_PRACTICE, LessonKind.REVIEW) and not self.target_skills:
            raise ValueError("Choose target skills for focused practice or review")
        if self.kind == LessonKind.ASSESSMENT and self.assistance.max_level != "none":
            raise ValueError("Assessment lessons cannot provide learning assistance")
        if self.kind in (LessonKind.PRACTICE, LessonKind.ASSESSMENT) and self.target_skills:
            raise ValueError("Whole scenarios cannot select individual skills")
        if self.kind == LessonKind.INTRODUCTION:
            if self.target_skills:
                raise ValueError("Interface introduction covers the whole workspace")
            self.assistance = AssistancePolicy(max_level="solution", on_request=True)
        if LearningSkill.INTERFACE in self.target_skills:
            raise ValueError("Choose introduction for interface training")
        return self


class HintRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    trigger: Literal["request", "automatic", "guided"] = "request"
    level: Literal["goal", "explanation", "solution"] = "goal"
    confirm_hint_id: UUID | None = None


class LearningHint(BaseModel):
    id: str
    task: str
    level: Literal["goal", "explanation", "solution"]
    text: str
    target: str | None = None
    presentation: Literal["text", "highlight"] = "text"
    advance: Literal["action", "confirm"] = "action"
    continue_allowed: bool = False


class HintRead(BaseModel):
    status: Literal["ready", "waiting", "disabled", "complete"]
    revision: int
    hint: LearningHint | None = None


class LearningMeasure(BaseModel):
    status: Literal["available", "not_measured", "pending"] = "not_measured"
    value: float | None = None
    unit: Literal["percent", "seconds"] = "percent"
    explanation: str


class LearningResult(BaseModel):
    correctness: LearningMeasure
    independence: LearningMeasure
    interface: LearningMeasure
    duration: LearningMeasure
    assistance_available: bool = False
