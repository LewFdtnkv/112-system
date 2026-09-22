"""Learning intent is separate from role, scenario difficulty and measured performance."""

from enum import StrEnum
from typing import Literal

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
    mode: Literal["none", "text", "visual"] = "none"
    max_level: Literal["goal", "explanation", "solution"] = "goal"
    on_request: bool = False
    idle_seconds: int | None = Field(default=None, ge=10, le=3600)

    @model_validator(mode="after")
    def coherent(self):
        if self.mode == "none" and (
            self.on_request or self.idle_seconds is not None or self.max_level != "goal"
        ):
            raise ValueError("Disabled assistance cannot have triggers or reveal a solution")
        if self.mode != "none" and not self.on_request and self.idle_seconds is None:
            raise ValueError("Assistance needs a request or inactivity trigger")
        return self


class LearningPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["learning-v1"] = "learning-v1"
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
        if self.kind == LessonKind.ASSESSMENT and self.assistance.mode != "none":
            raise ValueError("Assessment lessons cannot provide learning assistance")
        return self


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
