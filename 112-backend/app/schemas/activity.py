from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=4000)
    group_id: UUID | None = None
    student_id: UUID | None = None

    @model_validator(mode="after")
    def one_target(self):
        if (self.group_id is None) == (self.student_id is None):
            raise ValueError("Choose one group or student")
        return self


class TransferStudent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_group_id: UUID


class ProctoringObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command_id: UUID
    kind: Literal["tab.visible", "tab.hidden", "window.focus", "window.blur"]
    client_occurred_at: AwareDatetime


class ProctoringBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[ProctoringObservation] = Field(min_length=1, max_length=20)
