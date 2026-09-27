"""Small model decisions; identities, arithmetic and provenance are server-owned."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SemanticDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference_quote: str = Field(max_length=350)
    answer_quote: str = Field(max_length=350)
    reason: str = Field(min_length=1, max_length=700)
    verdict: Literal["correct", "partial", "incorrect", "uncertain"]
    confidence: float = Field(ge=0, le=1)
    recommendation: str = Field(max_length=500)


class RuleAdjustment(BaseModel):
    field: str
    before: float = Field(ge=0, le=1)
    after: float = Field(ge=0, le=1)
    action: Literal["increase", "keep", "decrease"]


class SemanticFinding(BaseModel):
    code: str
    label: str
    verdict: Literal["correct", "partial", "incorrect", "uncertain"]
    credit: float | None = Field(default=None, ge=0, le=1)
    applied: bool = False
    reason: str
    recommendation: str = ""
    reference_quote: str = ""
    answer_quote: str = ""
    rule_adjustment: RuleAdjustment | None = None

    @model_validator(mode="after")
    def coherent(self):
        if self.applied:
            expected = {"correct": 1, "partial": 0.5, "incorrect": 0}
            if self.verdict == "uncertain" or self.credit != expected.get(self.verdict):
                raise ValueError("Applied decisions must have the fixed rubric credit")
        elif self.credit is not None:
            raise ValueError("Unresolved decisions cannot award points")
        return self


class SemanticReview(BaseModel):
    status: Literal["queued", "running", "succeeded", "failed", "not_applicable"]
    model: str | None = None
    prompt_version: str | None = None
    findings: list[SemanticFinding] = Field(default_factory=list)
    process: dict = Field(default_factory=dict)
    retrieval: dict = Field(default_factory=dict)
    error: str | None = None


class SemanticSummary(BaseModel):
    status: Literal["pending", "complete", "partial", "unavailable", "not_applicable"]
    pending_cards: int = 0
    failed_cards: int = 0
    reviewed_cards: int = 0
    applied_criteria: int = 0
    needs_review: int = 0
    policy_version: str = "semantic-v1"
    semantic_weight_percent: int | None = 20
