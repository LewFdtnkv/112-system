"""Versioned automatic assessment contracts; AI execution is intentionally separate."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.semantic_assessment import SemanticSummary


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


class AssistanceSummary(BaseModel):
    issued_count: int = 0
    levels: dict[str, int] = Field(default_factory=dict)
    scoring: Literal["recorded_without_penalty"] = "recorded_without_penalty"


class AssessmentDetails(BaseModel):
    recommendations: list[str] = Field(default_factory=list)
    semantic: SemanticSummary | None = None
    assistance: AssistanceSummary = Field(default_factory=AssistanceSummary)
    policy_version: str
    scope: Literal["formal_fields", "hybrid", "partial"] = "formal_fields"
    criteria: list[AssessmentCriterion]
    unverified_fields: int
    evaluated_cards: int
    missed_cards: int = 0
    aggregation: str = "weighted_criteria_sum"
    source_evaluation_ids: list[UUID]
