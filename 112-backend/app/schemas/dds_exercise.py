"""Card-local DDS source history and pending crew reports, distinct from student work."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, ValidationError, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.catalog_document import StrictModel
from app.schemas.dds import CREW_TRANSITIONS, CrewRequirement

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
CrewCode = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")]
CrewStatus = Literal["assigned", "responding", "arrived", "in_progress", "completed", "cancelled"]


def invalid_field(path, message):
    raise ValidationError.from_exception_data(
        "DDSExercise",
        [{"type": PydanticCustomError("card_constraint", message), "loc": path, "input": None}],
    )


class PreparedCrewEvent(StrictModel):
    status: CrewStatus
    seconds_before_start: int = Field(default=0, ge=0, le=86400, strict=True)
    crew_number: str | None = Field(default=None, max_length=100)
    comment: str = Field(default="", max_length=5000)


class PreparedCrew(StrictModel):
    crew_code: CrewCode
    history: list[PreparedCrewEvent] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def valid_history(self):
        current = None
        previous_time = 86400
        for index, event in enumerate(self.history):
            allowed = CREW_TRANSITIONS[current] if current else {"assigned"}
            if event.status not in allowed:
                invalid_field(
                    ("history", index, "status"),
                    "История бригады должна начинаться с назначения и соблюдать порядок статусов.",
                )
            if event.seconds_before_start > previous_time:
                invalid_field(
                    ("history", index, "seconds_before_start"),
                    "Записи истории должны идти от ранних к поздним: число минут до "
                    "поступления карточки не должно увеличиваться.",
                )
            current, previous_time = event.status, event.seconds_before_start
        return self


class CrewReport(StrictModel):
    crew_code: CrewCode
    message: Text


class DDSExercise(StrictModel):
    service_profile_id: UUID
    initial_crews: list[PreparedCrew] = Field(default_factory=list, max_length=100)
    required_crews: list[CrewRequirement] = Field(min_length=1, max_length=100)
    messages: list[CrewReport] = Field(min_length=1, max_length=100)
    crew_calls_required: bool = False

    @model_validator(mode="after")
    def remaining_work(self):
        initial = {c.crew_code: c for c in self.initial_crews}
        goals = {c.crew_code: c.status for c in self.required_crews}
        if len(initial) != len(self.initial_crews) or len(goals) != len(self.required_crews):
            raise PydanticCustomError(
                "card_constraint", "Бригады в исходном состоянии и целях не должны повторяться."
            )
        informed = {m.crew_code for m in self.messages}
        if not set(goals) <= informed:
            raise PydanticCustomError(
                "card_constraint",
                "Для каждой учебной цели укажите сообщение по соответствующей бригаде.",
            )
        for index, (code, goal) in enumerate(goals.items()):
            history = initial[code].history if code in initial else []
            current = history[-1].status if history else None
            cycle = []
            for event in history:
                if event.status == "assigned":
                    cycle = []
                cycle.append(event.status)
            if (goal == "cancelled" and current == goal) or (
                goal != "cancelled" and current != "cancelled" and goal in cycle
            ):
                invalid_field(
                    ("required_crews", index, "status"),
                    "Учебная цель уже выполнена в исходной истории бригады. Выберите "
                    "следующий этап работы.",
                )
            pending, seen = [current], set()
            while pending:
                status = pending.pop()
                if status in seen:
                    continue
                seen.add(status)
                pending.extend(CREW_TRANSITIONS[status] if status else ["assigned"])
            if goal not in seen:
                invalid_field(
                    ("required_crews", index, "status"),
                    "Из исходного статуса нельзя достичь учебной цели бригады. "
                    "Измените цель или исходную историю.",
                )
        return self
