# Import every model here so Alembic sees the complete metadata.
from app.models.auth_session import AuthSession
from app.models.authoring import CardTemplate, CardTemplateRecipient, ScenarioCard
from app.models.classifier import ClassifierEntry, ClassifierRoute, ClassifierVersion
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
from app.models.telephony import TrainingCall
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
