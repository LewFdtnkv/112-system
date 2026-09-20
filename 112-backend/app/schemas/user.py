from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from app.schemas.auth import Username

UserRole = Literal["student", "teacher", "admin"]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Username
    initial_password: SecretStr = Field(min_length=12, max_length=128)
    first_name: str = Field(default="", max_length=100)
    last_name: str = Field(default="", max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    is_teacher: bool = False
    is_admin: bool = False
    role: UserRole | None = None

    @model_validator(mode="after")
    def exclusive_role(self):
        if self.role is not None:
            for key, value in (
                ("is_admin", self.role == "admin"),
                ("is_teacher", self.role == "teacher"),
            ):
                if key in self.model_fields_set and getattr(self, key) != value:
                    raise ValueError("Role conflicts with legacy permission flags")
                setattr(self, key, value)
        if self.is_admin and self.is_teacher:
            raise ValueError("A user must have exactly one role")
        return self

    @field_validator("initial_password")
    @classmethod
    def nonblank_password(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("Password must not be blank")
        return value


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: UserRole
    username: str
    first_name: str
    last_name: str
    middle_name: str | None
    email: str | None
    is_active: bool
    is_teacher: bool
    is_admin: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None
    password_changed_at: datetime | None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(default="", max_length=100)
    last_name: str = Field(default="", max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    reason: str | None = Field(default=None, min_length=1, max_length=2000)
    role: UserRole = "student"
    is_active: bool = True
