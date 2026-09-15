from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

WorkstationCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$"
    ),
]
WorkstationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class WorkstationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: WorkstationCode
    name: WorkstationName


class WorkstationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    created_at: datetime
