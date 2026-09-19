"""Versioned automatic assessment contracts; AI execution is intentionally separate."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AssessmentWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    classification: int = Field(default=25, ge=1, le=100)
    notification: int = Field(default=25, ge=1, le=100)
    address: int = Field(default=30, ge=1, le=100)
    caller: int = Field(default=10, ge=1, le=100)
    victims: int = Field(default=10, ge=1, le=100)


class AssessmentPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["weighted-fields-v1"] = "weighted-fields-v1"
    weights: AssessmentWeights = Field(default_factory=AssessmentWeights)


class AssessmentCriterion(BaseModel):
    code: str
    label: str
    score: float
    max_score: float
    explanation: str


class AssessmentDetails(BaseModel):
    policy_version: str
    scope: Literal["formal_fields"] = "formal_fields"
    criteria: list[AssessmentCriterion]
    unverified_fields: int
    evaluated_cards: int
    source_evaluation_ids: list[UUID]


class AICriterionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=100)
    decision: Literal["satisfied", "partial", "failed", "abstain"]
    credit: float | None = Field(default=None, ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=3000)
    evidence_event_ids: list[UUID] = Field(default_factory=list, max_length=20)
    evidence_field_paths: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def consistent_credit(self):
        if self.decision == "abstain" and self.credit is not None:
            raise ValueError("Abstention cannot award points")
        if self.decision != "abstain" and self.credit is None:
            raise ValueError("A decision requires credit")
        if self.decision == "satisfied" and self.credit != 1:
            raise ValueError("Satisfied means full credit")
        if self.decision == "failed" and self.credit != 0:
            raise ValueError("Failed means zero credit")
        if self.decision == "partial" and not 0 < self.credit < 1:
            raise ValueError("Partial credit must be between zero and one")
        return self


class AIAssessmentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["assessment-ai-v1"]
    attempt_id: UUID
    context_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    model_version: str = Field(min_length=1, max_length=255)
    prompt_version: str = Field(min_length=1, max_length=100)
    completed_at: datetime
    criteria: list[AICriterionDecision] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_criteria(self):
        if len({item.code for item in self.criteria}) != len(self.criteria):
            raise ValueError("Criterion decisions must not repeat")
        return self
