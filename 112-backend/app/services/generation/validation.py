"""Field locations for generation constraints, compatible with form validation."""

from fastapi import HTTPException


class ParameterConflict(ValueError):
    def __init__(self, message: str, *fields: str):
        super().__init__(message)
        self.fields = fields


def reject_parameters(message: str, *fields: str):
    raise HTTPException(
        422,
        detail=[
            {
                "loc": ["body", "parameters", *field.split(".")],
                "type": "generation_constraint",
                "msg": message,
            }
            for field in fields
        ],
    )
