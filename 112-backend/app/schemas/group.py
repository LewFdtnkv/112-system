from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Title


class GroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    teacher_id: UUID
    created_at: datetime


class GroupMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_id: UUID
    user_id: UUID
    created_at: datetime
