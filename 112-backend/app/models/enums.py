from enum import StrEnum


class PublicationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class TrainingRole(StrEnum):
    OPERATOR_112 = "operator_112"
    DDS = "dds"


class TrainingMode(StrEnum):
    INTRODUCTION = "introduction"
    PRACTICE = "practice"
    ASSESSMENT = "assessment"


class LessonStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class AttemptStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    INTERRUPTED = "interrupted"


class CardOrigin(StrEnum):
    STUDENT = "student"
    PREPARED = "prepared"
    COPIED = "copied"


class CardStatus(StrEnum):
    DRAFT = "draft"
    REGISTERED = "registered"
    NOTIFIED = "notified"  # «Отработана»: оповещение со стороны 112 закончено.
    COMPLETED = "completed"  # «Завершена»: работа всех служб завершена.


class ResponseStatus(StrEnum):
    ADDED = "added"
    RECEIVED = "received"
    ACCEPTED = "accepted"
    NOT_ACCEPTED = "not_accepted"
    RESPONDING = "responding"
    ARRIVED = "arrived"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REFUSED = "refused"


class EventActor(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    SIMULATION = "simulation"
    SYSTEM = "system"


class CallStatus(StrEnum):
    DIALING = "dialing"
    CONNECTED = "connected"
    ENDED = "ended"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    FAILED = "failed"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AIPurpose(StrEnum):
    RECOMMENDATION = "recommendation"
    GENERATION = "generation"
    EVALUATION = "evaluation"


class EvaluationMethod(StrEnum):
    RULES = "rules"
    AI = "ai"
    TEACHER = "teacher"


class EvaluationStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"
