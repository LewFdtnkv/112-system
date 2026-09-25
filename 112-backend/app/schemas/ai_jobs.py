from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import AIPurpose, JobStatus


class AIJobSummary(BaseModel):
    queued: int
    running: int
    succeeded: int
    failed: int


class AIJobItem(BaseModel):
    id: UUID
    purpose: AIPurpose
    status: JobStatus
    created_by_id: UUID | None
    created_by_username: str | None
    student_id: UUID | None
    student_username: str | None
    model_version: str | None
    retry_count: int
    created_at: datetime
    available_at: datetime
    completed_at: datetime | None
    lease_expires_at: datetime | None
    lease_expired: bool
    generation_method: str | None
    error_summary: str | None


class AIJobPage(BaseModel):
    items: list[AIJobItem]
    total: int
    offset: int
    limit: int
    summary: AIJobSummary
    as_of: datetime


class AIJobDetail(AIJobItem):
    prompt_version: str
    idempotency_key: UUID
    card_template_id: UUID | None
    scenario_version_id: UUID | None
    attempt_id: UUID | None
    input: dict[str, Any]
    context: dict[str, Any]
    output: dict[str, Any] | None
    error: str | None
