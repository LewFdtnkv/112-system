# Import every model here so Alembic sees the complete metadata.
from app.models.activity import (
    MessageRecipient,
    ProctoringEvent,
    TeachingMessage,
    UserActivity,
    UserPhoto,
)
from app.models.auth_session import AuthSession
from app.models.authoring import CardTemplate, CardTemplateRecipient, ScenarioCard
from app.models.classifier import ClassifierEntry, ClassifierRoute, ClassifierVersion
from app.models.crew import CrewAssignment
from app.models.directory import (
    Service,
    ServiceObject,
    ServiceProfile,
    ServiceTerritory,
    TrainingContact,
    UserService,
)
from app.models.evaluation import AIJob, CriterionEvidence, CriterionResult, Evaluation
from app.models.incident import IncidentCard, ResponseEvent, ServiceResponse
from app.models.lesson_evaluation import LessonEvaluation
from app.models.scenario import AnswerKey, Scenario, ScenarioVersion
from app.models.telephony import (
    CallCue,
    SpeechAsset,
    TelephonyEvent,
    TelephonyStation,
    TrainingCall,
)
from app.models.training import (
    Assignment,
    Attempt,
    AttemptEvent,
    GroupMembership,
    Lesson,
    TrainingGroup,
)
from app.models.user import User

__all__ = [
    "CallCue",
    "SpeechAsset",
    "TelephonyEvent",
    "TelephonyStation",
    "MessageRecipient",
    "ProctoringEvent",
    "TeachingMessage",
    "UserActivity",
    "UserPhoto",
    "AIJob",
    "AnswerKey",
    "Assignment",
    "Attempt",
    "AttemptEvent",
    "AuthSession",
    "CardTemplate",
    "CardTemplateRecipient",
    "ClassifierEntry",
    "ClassifierRoute",
    "ClassifierVersion",
    "CriterionEvidence",
    "CriterionResult",
    "CrewAssignment",
    "Evaluation",
    "GroupMembership",
    "IncidentCard",
    "Lesson",
    "LessonEvaluation",
    "ResponseEvent",
    "Scenario",
    "ScenarioCard",
    "ScenarioVersion",
    "Service",
    "ServiceObject",
    "ServiceProfile",
    "ServiceResponse",
    "ServiceTerritory",
    "TrainingCall",
    "TrainingContact",
    "TrainingGroup",
    "User",
    "UserService",
]
