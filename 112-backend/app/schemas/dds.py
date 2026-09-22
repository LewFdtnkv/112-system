from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from app.schemas.catalog_document import StrictModel

DDSStatus = Literal[
    "accepted", "not_accepted", "responding", "arrived", "in_progress", "completed", "refused"
]
TRANSITIONS = {
    "received": {"accepted", "not_accepted"},
    "accepted": {"responding", "arrived", "in_progress", "completed", "refused"},
    "responding": {"arrived", "in_progress", "completed", "refused"},
    "arrived": {"in_progress", "completed", "refused"},
    "in_progress": {"completed", "refused"},
    "not_accepted": {"accepted"},
    "completed": set(),
    "refused": set(),
}
STATUS_LABELS = {
    "received": "Получена службой",
    "accepted": "Принята",
    "not_accepted": "Не принята",
    "responding": "Начало реагирования",
    "arrived": "Прибытие",
    "in_progress": "Проведение работ",
    "completed": "Работы завершены",
    "refused": "Отказ от выполнения работ",
}


class DDSStep(StrictModel):
    status: DDSStatus
    message: str = Field(min_length=1, max_length=5000)
    crew_number: str | None = Field(default=None, max_length=100)


class CrewRequirement(StrictModel):
    crew_code: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    status: Literal["assigned", "responding", "arrived", "in_progress", "completed", "cancelled"]


class DDSPolicy(StrictModel):
    workflow: Literal["service-v1", "crews-v1"] = "service-v1"
    steps: list[DDSStep] = Field(min_length=1, max_length=7)
    required_crews: list[CrewRequirement] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_steps(self):
        if len({c.crew_code for c in self.required_crews}) != len(self.required_crews):
            raise ValueError("Required crews must not repeat")
        if self.workflow == "crews-v1":
            if not self.required_crews or any(not step.message.strip() for step in self.steps):
                raise ValueError("Crew exercises require messages and crew goals")
            return self
        current = "received"
        for step in self.steps:
            if step.status not in TRANSITIONS[current] or not step.message.strip():
                raise ValueError(
                    "DDS steps must follow valid transitions and include source information"
                )
            if step.crew_number is not None and (
                not step.crew_number.strip() or step.crew_number not in step.message
            ):
                raise ValueError("Expected crew number must be present in the source message")
            current = step.status
        return self


class DDSAction(StrictModel):
    request_id: UUID
    revision: int = Field(ge=1)
    information_event_id: UUID
    status: DDSStatus
    crew_number: str | None = Field(default=None, max_length=100)
    comment: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)
    ]


class DDSFinish(StrictModel):
    revision: int = Field(ge=1)


CREW_TRANSITIONS = {
    "assigned": {"responding", "cancelled"},
    "responding": {"arrived", "cancelled"},
    "arrived": {"in_progress", "completed", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": {"assigned"},
}
CREW_LABELS = {**STATUS_LABELS, "assigned": "Назначена", "cancelled": "Назначение отменено"}


class CrewCommand(StrictModel):
    request_id: UUID
    revision: int = Field(ge=1)
    information_event_id: UUID
    crew_code: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    status: Literal["assigned", "responding", "arrived", "in_progress", "completed", "cancelled"]
    crew_number: str | None = Field(default=None, max_length=100)
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)] = ""
