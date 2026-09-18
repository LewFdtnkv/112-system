"""add training domain

Revision ID: 0002_training_domain
Revises: 0001_users
Create Date: 2026-09-18 13:48:46.053847
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_training_domain"
down_revision: str | None = "0001_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "services",
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_services")),
        sa.UniqueConstraint("code", name=op.f("uq_services_code")),
    )
    op.create_table(
        "classifier_versions",
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_storage_key", sa.Text(), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                "archived",
                name="classifier_publication",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "import_report",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("approved_by_id", sa.Uuid(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_sha256 ~ '^[0-9a-f]{64}$'", name=op.f("ck_classifier_versions_source_checksum")
        ),
        sa.CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name=op.f("ck_classifier_versions_publication_approval"),
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_id"],
            ["users.id"],
            name=op.f("fk_classifier_versions_approved_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_classifier_versions")),
        sa.UniqueConstraint("label", name=op.f("uq_classifier_versions_label")),
    )
    op.create_table(
        "scenarios",
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_scenarios_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenarios")),
    )
    op.create_table(
        "service_profiles",
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                "archived",
                name="profile_publication",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("responsibility", sa.Text(), nullable=False),
        sa.Column(
            "rules", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column("approved_by_id", sa.Uuid(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name=op.f("ck_service_profiles_publication_approval"),
        ),
        sa.CheckConstraint("version > 0", name=op.f("ck_service_profiles_positive_version")),
        sa.ForeignKeyConstraint(
            ["approved_by_id"],
            ["users.id"],
            name=op.f("fk_service_profiles_approved_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_service_profiles_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_profiles")),
        sa.UniqueConstraint("service_id", "version", name=op.f("uq_service_profiles_service_id")),
    )
    op.create_table(
        "training_groups",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["users.id"],
            name=op.f("fk_training_groups_teacher_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_training_groups")),
    )
    op.create_index(
        op.f("ix_training_groups_teacher_id"), "training_groups", ["teacher_id"], unique=False
    )
    op.create_table(
        "user_services",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_user_services_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_services_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "service_id", name=op.f("pk_user_services")),
    )
    op.create_index(
        op.f("ix_user_services_service_id"), "user_services", ["service_id"], unique=False
    )
    op.create_table(
        "classifier_entries",
        sa.Column("classifier_version_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("section", sa.String(length=255), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("response_scenario", sa.Text(), nullable=True),
        sa.Column(
            "conditions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("source_sheet", sa.String(length=100), nullable=False),
        sa.Column("source_row", sa.Integer(), nullable=False),
        sa.Column("source_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "source_row > 0", name=op.f("ck_classifier_entries_positive_source_row")
        ),
        sa.ForeignKeyConstraint(
            ["classifier_version_id"],
            ["classifier_versions.id"],
            name=op.f("fk_classifier_entries_classifier_version_id_classifier_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_classifier_entries")),
        sa.UniqueConstraint(
            "classifier_version_id",
            "code",
            name=op.f("uq_classifier_entries_classifier_version_id"),
        ),
        sa.UniqueConstraint("id", "classifier_version_id", name=op.f("uq_classifier_entries_id")),
    )
    op.create_table(
        "group_memberships",
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["training_groups.id"],
            name=op.f("fk_group_memberships_group_id_training_groups"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_group_memberships_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("group_id", "user_id", name=op.f("pk_group_memberships")),
    )
    op.create_index(
        op.f("ix_group_memberships_user_id"), "group_memberships", ["user_id"], unique=False
    )
    op.create_table(
        "lessons",
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("group_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "planned",
                "active",
                "finished",
                "cancelled",
                name="lesson_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)",
            name=op.f("ck_lessons_time_order"),
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["training_groups.id"],
            name=op.f("fk_lessons_group_id_training_groups"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["users.id"],
            name=op.f("fk_lessons_teacher_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lessons")),
    )
    op.create_index(op.f("ix_lessons_group_id"), "lessons", ["group_id"], unique=False)
    op.create_index(op.f("ix_lessons_teacher_id"), "lessons", ["teacher_id"], unique=False)
    op.create_table(
        "scenario_versions",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "operator_112",
                "dds",
                name="scenario_role",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                "archived",
                name="scenario_publication",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("classifier_version_id", sa.Uuid(), nullable=False),
        sa.Column("service_profile_id", sa.Uuid(), nullable=True),
        sa.Column("difficulty", sa.String(length=50), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("caller_message", sa.Text(), nullable=True),
        sa.Column("caller_audio_key", sa.Text(), nullable=True),
        sa.Column(
            "initial_card",
            postgresql.JSONB(none_as_null=True, astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "scheduled_events",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "hints", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
        sa.Column(
            "completion_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "provenance",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("approved_by_id", sa.Uuid(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role != 'dds' OR service_profile_id IS NOT NULL",
            name=op.f("ck_scenario_versions_dds_profile"),
        ),
        sa.CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name=op.f("ck_scenario_versions_publication_approval"),
        ),
        sa.CheckConstraint("version > 0", name=op.f("ck_scenario_versions_positive_version")),
        sa.ForeignKeyConstraint(
            ["approved_by_id"],
            ["users.id"],
            name=op.f("fk_scenario_versions_approved_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["classifier_version_id"],
            ["classifier_versions.id"],
            name=op.f("fk_scenario_versions_classifier_version_id_classifier_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["scenarios.id"],
            name=op.f("fk_scenario_versions_scenario_id_scenarios"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_profile_id"],
            ["service_profiles.id"],
            name=op.f("fk_scenario_versions_service_profile_id_service_profiles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario_versions")),
        sa.UniqueConstraint(
            "scenario_id", "version", name=op.f("uq_scenario_versions_scenario_id")
        ),
    )
    op.create_index(
        op.f("ix_scenario_versions_classifier_version_id"),
        "scenario_versions",
        ["classifier_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scenario_versions_service_profile_id"),
        "scenario_versions",
        ["service_profile_id"],
        unique=False,
    )
    op.create_table(
        "service_territories",
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["service_profiles.id"],
            name=op.f("fk_service_territories_profile_id_service_profiles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_territories")),
        sa.UniqueConstraint("id", "profile_id", name=op.f("uq_service_territories_id")),
        sa.UniqueConstraint("profile_id", "code", name=op.f("uq_service_territories_profile_id")),
    )
    op.create_table(
        "training_contacts",
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("target_service_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("endpoint_key", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'",
            name=op.f("ck_training_contacts_local_endpoint"),
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["service_profiles.id"],
            name=op.f("fk_training_contacts_profile_id_service_profiles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_service_id"],
            ["services.id"],
            name=op.f("fk_training_contacts_target_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_training_contacts")),
        sa.UniqueConstraint("id", "target_service_id", name=op.f("uq_training_contacts_id")),
        sa.UniqueConstraint("profile_id", "code", name=op.f("uq_training_contacts_profile_id")),
    )
    op.create_index(
        op.f("ix_training_contacts_target_service_id"),
        "training_contacts",
        ["target_service_id"],
        unique=False,
    )
    op.create_table(
        "answer_keys",
        sa.Column("scenario_version_id", sa.Uuid(), nullable=False),
        sa.Column(
            "expected_card",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "expected_actions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "rubric", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
        sa.Column("explanation", sa.Text(), server_default="", nullable=False),
        sa.ForeignKeyConstraint(
            ["scenario_version_id"],
            ["scenario_versions.id"],
            name=op.f("fk_answer_keys_scenario_version_id_scenario_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("scenario_version_id", name=op.f("pk_answer_keys")),
    )
    op.create_table(
        "assignments",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("scenario_version_id", sa.Uuid(), nullable=False),
        sa.Column(
            "mode",
            sa.Enum(
                "introduction",
                "practice",
                "assessment",
                name="assignment_mode",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("time_limit_seconds", sa.Integer(), nullable=True),
        sa.Column("hint_delay_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "settings", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "hint_delay_seconds IS NULL OR hint_delay_seconds > 0",
            name=op.f("ck_assignments_hint_delay"),
        ),
        sa.CheckConstraint(
            "time_limit_seconds IS NULL OR time_limit_seconds > 0",
            name=op.f("ck_assignments_time_limit"),
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["lessons.id"],
            name=op.f("fk_assignments_lesson_id_lessons"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_version_id"],
            ["scenario_versions.id"],
            name=op.f("fk_assignments_scenario_version_id_scenario_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_assignments_student_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assignments")),
        sa.UniqueConstraint(
            "id", "student_id", "scenario_version_id", name=op.f("uq_assignments_id")
        ),
    )
    op.create_index(op.f("ix_assignments_lesson_id"), "assignments", ["lesson_id"], unique=False)
    op.create_index(
        op.f("ix_assignments_scenario_version_id"),
        "assignments",
        ["scenario_version_id"],
        unique=False,
    )
    op.create_index(op.f("ix_assignments_student_id"), "assignments", ["student_id"], unique=False)
    op.create_table(
        "classifier_routes",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column("is_main", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "conditions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entry_id"],
            ["classifier_entries.id"],
            name=op.f("fk_classifier_routes_entry_id_classifier_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_classifier_routes_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_classifier_routes")),
        sa.UniqueConstraint("entry_id", "service_id", name=op.f("uq_classifier_routes_entry_id")),
    )
    op.create_index(
        op.f("ix_classifier_routes_service_id"), "classifier_routes", ["service_id"], unique=False
    )
    op.create_table(
        "service_objects",
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("territory_id", sa.Uuid(), nullable=True),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("responsibility", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["service_profiles.id"],
            name=op.f("fk_service_objects_profile_id_service_profiles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["territory_id", "profile_id"],
            ["service_territories.id", "service_territories.profile_id"],
            name=op.f("fk_service_objects_territory_id_service_territories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_objects")),
        sa.UniqueConstraint("profile_id", "code", name=op.f("uq_service_objects_profile_id")),
    )
    op.create_index(
        op.f("ix_service_objects_territory_id"), "service_objects", ["territory_id"], unique=False
    )
    op.create_table(
        "attempts",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("scenario_version_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column(
            "mode",
            sa.Enum(
                "introduction",
                "practice",
                "assessment",
                name="attempt_mode",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("settings_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "in_progress",
                "completed",
                "interrupted",
                name="attempt_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "(status = 'in_progress' AND ended_at IS NULL) OR (status != "
            "'in_progress' AND ended_at IS NOT NULL)",
            name=op.f("ck_attempts_end_state"),
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at", name=op.f("ck_attempts_time_order")
        ),
        sa.CheckConstraint("number > 0", name=op.f("ck_attempts_positive_number")),
        sa.ForeignKeyConstraint(
            ["assignment_id", "student_id", "scenario_version_id"],
            ["assignments.id", "assignments.student_id", "assignments.scenario_version_id"],
            name=op.f("fk_attempts_assignment_id_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_version_id"],
            ["scenario_versions.id"],
            name=op.f("fk_attempts_scenario_version_id_scenario_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_attempts_student_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attempts")),
        sa.UniqueConstraint("assignment_id", "number", name=op.f("uq_attempts_assignment_id")),
    )
    op.create_index(
        op.f("ix_attempts_scenario_version_id"), "attempts", ["scenario_version_id"], unique=False
    )
    op.create_index(
        "ix_attempts_student_started", "attempts", ["student_id", "started_at"], unique=False
    )
    op.create_table(
        "ai_jobs",
        sa.Column(
            "purpose",
            sa.Enum(
                "generation",
                "evaluation",
                name="ai_purpose",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("scenario_version_id", sa.Uuid(), nullable=True),
        sa.Column("attempt_id", sa.Uuid(), nullable=True),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "running",
                "succeeded",
                "failed",
                name="ai_job_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("worker_id", sa.String(length=100), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("model_version", sa.String(length=255), nullable=True),
        sa.Column("prompt_version", sa.String(length=100), nullable=False),
        sa.Column("input", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "context", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column(
            "output", postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), nullable=True
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose != 'evaluation' OR attempt_id IS NOT NULL",
            name=op.f("ck_ai_jobs_evaluation_target"),
        ),
        sa.CheckConstraint(
            "status != 'running' OR (worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)",
            name=op.f("ck_ai_jobs_running_lease"),
        ),
        sa.CheckConstraint("retry_count >= 0", name=op.f("ck_ai_jobs_nonnegative_retries")),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_ai_jobs_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_version_id"],
            ["scenario_versions.id"],
            name=op.f("fk_ai_jobs_scenario_version_id_scenario_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_jobs")),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_ai_jobs_id")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_ai_jobs_idempotency_key")),
    )
    op.create_index(op.f("ix_ai_jobs_attempt_id"), "ai_jobs", ["attempt_id"], unique=False)
    op.create_index("ix_ai_jobs_poll", "ai_jobs", ["status", "available_at"], unique=False)
    op.create_index(
        op.f("ix_ai_jobs_scenario_version_id"), "ai_jobs", ["scenario_version_id"], unique=False
    )
    op.create_table(
        "attempt_events",
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("command_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=100), nullable=False),
        sa.Column(
            "actor",
            sa.Enum(
                "student",
                "teacher",
                "simulation",
                "system",
                name="event_actor",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("client_occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "payload", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "(actor IN ('student', 'teacher') AND actor_id IS NOT NULL) OR (actor IN "
            "('system', 'simulation') AND actor_id IS NULL)",
            name=op.f("ck_attempt_events_actor_identity"),
        ),
        sa.CheckConstraint("sequence > 0", name=op.f("ck_attempt_events_positive_sequence")),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_attempt_events_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_attempt_events_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attempt_events")),
        sa.UniqueConstraint(
            "attempt_id", "command_id", name="uq_attempt_events_attempt_id_command_id"
        ),
        sa.UniqueConstraint("attempt_id", "sequence", name="uq_attempt_events_attempt_id_sequence"),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_attempt_events_id")),
    )
    op.create_table(
        "incident_cards",
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column(
            "origin",
            sa.Enum(
                "student",
                "prepared",
                "copied",
                name="card_origin",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("source_card_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("display_number", sa.String(length=50), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "registered",
                "notified",
                "completed",
                name="card_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("classifier_version_id", sa.Uuid(), nullable=False),
        sa.Column("classifier_entry_id", sa.Uuid(), nullable=True),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("caller_name", sa.String(length=255), nullable=True),
        sa.Column("caller_phone", sa.String(length=100), nullable=True),
        sa.Column(
            "caller_details",
            postgresql.JSONB(none_as_null=True, astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("address_text", sa.Text(), nullable=True),
        sa.Column(
            "address_details",
            postgresql.JSONB(none_as_null=True, astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("victim_details", sa.Text(), nullable=True),
        sa.Column(
            "features", postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "additional_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "origin != 'copied' OR source_card_id IS NOT NULL",
            name=op.f("ck_incident_cards_copy_source"),
        ),
        sa.CheckConstraint(
            "notification_completed_at IS NULL OR (saved_at IS NOT NULL AND "
            "notification_completed_at >= saved_at)",
            name=op.f("ck_incident_cards_notification_time_order"),
        ),
        sa.CheckConstraint("revision > 0", name=op.f("ck_incident_cards_positive_revision")),
        sa.CheckConstraint(
            "saved_at IS NULL OR (opened_at IS NOT NULL AND saved_at >= opened_at)",
            name=op.f("ck_incident_cards_creation_time_order"),
        ),
        sa.CheckConstraint(
            "source_card_id IS NULL OR source_card_id != id",
            name=op.f("ck_incident_cards_not_own_source"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_incident_cards_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["classifier_entry_id", "classifier_version_id"],
            ["classifier_entries.id", "classifier_entries.classifier_version_id"],
            name=op.f("fk_incident_cards_classifier_entry_id_classifier_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["classifier_version_id"],
            ["classifier_versions.id"],
            name=op.f("fk_incident_cards_classifier_version_id_classifier_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_incident_cards_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_card_id"],
            ["incident_cards.id"],
            name=op.f("fk_incident_cards_source_card_id_incident_cards"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incident_cards")),
        sa.UniqueConstraint("attempt_id", name=op.f("uq_incident_cards_attempt_id")),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_incident_cards_id")),
    )
    op.create_index(
        op.f("ix_incident_cards_classifier_entry_id"),
        "incident_cards",
        ["classifier_entry_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_incident_cards_classifier_version_id"),
        "incident_cards",
        ["classifier_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_incident_cards_source_card_id"), "incident_cards", ["source_card_id"], unique=False
    )
    op.create_table(
        "evaluations",
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "method",
            sa.Enum(
                "rules",
                "ai",
                "teacher",
                name="evaluation_method",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "completed",
                "needs_review",
                "failed",
                name="evaluation_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("supersedes_id", sa.Uuid(), nullable=True),
        sa.Column("ai_job_id", sa.Uuid(), nullable=True),
        sa.Column("reviewer_id", sa.Uuid(), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column("score", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("max_score", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "method != 'ai' OR ai_job_id IS NOT NULL", name=op.f("ck_evaluations_ai_provenance")
        ),
        sa.CheckConstraint(
            "method != 'teacher' OR (reviewer_id IS NOT NULL AND review_reason IS NOT "
            "NULL AND length(btrim(review_reason)) > 0)",
            name=op.f("ck_evaluations_teacher_reason"),
        ),
        sa.CheckConstraint(
            "(score IS NULL OR score >= 0) AND (max_score IS NULL OR max_score > 0) "
            "AND (score IS NULL OR (max_score IS NOT NULL AND score <= max_score))",
            name=op.f("ck_evaluations_score_range"),
        ),
        sa.CheckConstraint("revision > 0", name=op.f("ck_evaluations_positive_revision")),
        sa.CheckConstraint(
            "supersedes_id IS NULL OR supersedes_id != id",
            name=op.f("ck_evaluations_not_own_predecessor"),
        ),
        sa.ForeignKeyConstraint(
            ["ai_job_id", "attempt_id"],
            ["ai_jobs.id", "ai_jobs.attempt_id"],
            name=op.f("fk_evaluations_ai_job_id_ai_jobs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_evaluations_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_evaluations_reviewer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_id", "attempt_id"],
            ["evaluations.id", "evaluations.attempt_id"],
            name=op.f("fk_evaluations_supersedes_id_evaluations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_evaluations")),
        sa.UniqueConstraint("attempt_id", "revision", name=op.f("uq_evaluations_attempt_id")),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_evaluations_id")),
    )
    op.create_index(op.f("ix_evaluations_ai_job_id"), "evaluations", ["ai_job_id"], unique=False)
    op.create_index(
        op.f("ix_evaluations_supersedes_id"), "evaluations", ["supersedes_id"], unique=False
    )
    op.create_table(
        "service_responses",
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "added",
                "received",
                "accepted",
                "not_accepted",
                "responding",
                "arrived",
                "in_progress",
                "completed",
                "refused",
                name="response_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_decision_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("crew_number", sa.String(length=100), nullable=True),
        sa.Column("comment", sa.Text(), server_default="", nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0",
            name=op.f("ck_service_responses_refusal_reason"),
        ),
        sa.CheckConstraint(
            "first_decision_at IS NULL OR (sent_at IS NOT NULL AND first_decision_at >= sent_at)",
            name=op.f("ck_service_responses_decision_time_order"),
        ),
        sa.CheckConstraint(
            "received_at IS NULL OR (sent_at IS NOT NULL AND received_at >= sent_at)",
            name=op.f("ck_service_responses_receipt_time_order"),
        ),
        sa.CheckConstraint("revision > 0", name=op.f("ck_service_responses_positive_revision")),
        sa.CheckConstraint(
            "sent_at IS NULL OR sent_at >= added_at",
            name=op.f("ck_service_responses_dispatch_time_order"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_service_responses_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["card_id", "attempt_id"],
            ["incident_cards.id", "incident_cards.attempt_id"],
            name=op.f("fk_service_responses_card_id_incident_cards"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_service_responses_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_responses")),
        sa.UniqueConstraint("card_id", "service_id", name=op.f("uq_service_responses_card_id")),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_service_responses_id")),
    )
    op.create_index(
        op.f("ix_service_responses_attempt_id"), "service_responses", ["attempt_id"], unique=False
    )
    op.create_index(
        op.f("ix_service_responses_service_id"), "service_responses", ["service_id"], unique=False
    )
    op.create_table(
        "criterion_results",
        sa.Column("evaluation_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("criterion_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("max_score", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "(score IS NULL OR score >= 0) AND max_score > 0 AND (score IS NULL OR "
            "score <= max_score)",
            name=op.f("ck_criterion_results_score_range"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_criterion_results_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_id", "attempt_id"],
            ["evaluations.id", "evaluations.attempt_id"],
            name=op.f("fk_criterion_results_evaluation_id_evaluations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_criterion_results")),
        sa.UniqueConstraint(
            "evaluation_id", "code", name=op.f("uq_criterion_results_evaluation_id")
        ),
        sa.UniqueConstraint("id", "attempt_id", name=op.f("uq_criterion_results_id")),
    )
    op.create_index(
        op.f("ix_criterion_results_attempt_id"), "criterion_results", ["attempt_id"], unique=False
    )
    op.create_table(
        "response_events",
        sa.Column("response_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_event_id", sa.Uuid(), nullable=False),
        sa.Column("information_event_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "added",
                "received",
                "accepted",
                "not_accepted",
                "responding",
                "arrived",
                "in_progress",
                "completed",
                "refused",
                name="response_event_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("crew_number", sa.String(length=100), nullable=True),
        sa.Column("comment", sa.Text(), server_default="", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0",
            name=op.f("ck_response_events_refusal_reason"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            name=op.f("fk_response_events_attempt_event_id_attempt_events"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_response_events_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["information_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            name=op.f("fk_response_events_information_event_id_attempt_events"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            name=op.f("fk_response_events_response_id_service_responses"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_response_events")),
        sa.UniqueConstraint("attempt_event_id", name=op.f("uq_response_events_attempt_event_id")),
    )
    op.create_index(
        op.f("ix_response_events_attempt_id"), "response_events", ["attempt_id"], unique=False
    )
    op.create_index(
        op.f("ix_response_events_information_event_id"),
        "response_events",
        ["information_event_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_events_response_id"), "response_events", ["response_id"], unique=False
    )
    op.create_table(
        "training_calls",
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("response_id", sa.Uuid(), nullable=False),
        sa.Column("command_id", sa.Uuid(), nullable=False),
        sa.Column("initiated_by_id", sa.Uuid(), nullable=False),
        sa.Column("contact_id", sa.Uuid(), nullable=False),
        sa.Column("target_service_id", sa.Uuid(), nullable=False),
        sa.Column("contact_name", sa.String(length=255), nullable=False),
        sa.Column("target_service_name", sa.String(length=255), nullable=False),
        sa.Column("endpoint_key", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "dialing",
                "connected",
                "ended",
                "busy",
                "no_answer",
                "failed",
                name="call_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("provider_call_id", sa.String(length=255), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("recording_key", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'",
            name=op.f("ck_training_calls_local_endpoint"),
        ),
        sa.CheckConstraint(
            "connected_at IS NULL OR connected_at >= started_at",
            name=op.f("ck_training_calls_connection_time_order"),
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR (ended_at >= started_at AND (connected_at IS NULL OR "
            "ended_at >= connected_at))",
            name=op.f("ck_training_calls_end_time_order"),
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_training_calls_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["contact_id", "target_service_id"],
            ["training_contacts.id", "training_contacts.target_service_id"],
            name=op.f("fk_training_calls_contact_id_training_contacts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["initiated_by_id"],
            ["users.id"],
            name=op.f("fk_training_calls_initiated_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            name=op.f("fk_training_calls_response_id_service_responses"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_service_id"],
            ["services.id"],
            name=op.f("fk_training_calls_target_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_training_calls")),
        sa.UniqueConstraint("attempt_id", "command_id", name=op.f("uq_training_calls_attempt_id")),
        sa.UniqueConstraint("provider_call_id", name=op.f("uq_training_calls_provider_call_id")),
    )
    op.create_index(
        op.f("ix_training_calls_contact_id"), "training_calls", ["contact_id"], unique=False
    )
    op.create_index(
        op.f("ix_training_calls_response_id"), "training_calls", ["response_id"], unique=False
    )
    op.create_index(
        op.f("ix_training_calls_target_service_id"),
        "training_calls",
        ["target_service_id"],
        unique=False,
    )
    op.create_table(
        "criterion_evidence",
        sa.Column("criterion_result_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_event_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["attempt_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            name=op.f("fk_criterion_evidence_attempt_event_id_attempt_events"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name=op.f("fk_criterion_evidence_attempt_id_attempts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criterion_result_id", "attempt_id"],
            ["criterion_results.id", "criterion_results.attempt_id"],
            name=op.f("fk_criterion_evidence_criterion_result_id_criterion_results"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "criterion_result_id", "attempt_event_id", name=op.f("pk_criterion_evidence")
        ),
    )
    op.create_index(
        op.f("ix_criterion_evidence_attempt_event_id"),
        "criterion_evidence",
        ["attempt_event_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_criterion_evidence_attempt_id"), "criterion_evidence", ["attempt_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_criterion_evidence_attempt_id"), table_name="criterion_evidence")
    op.drop_index(op.f("ix_criterion_evidence_attempt_event_id"), table_name="criterion_evidence")
    op.drop_table("criterion_evidence")
    op.drop_index(op.f("ix_training_calls_target_service_id"), table_name="training_calls")
    op.drop_index(op.f("ix_training_calls_response_id"), table_name="training_calls")
    op.drop_index(op.f("ix_training_calls_contact_id"), table_name="training_calls")
    op.drop_table("training_calls")
    op.drop_index(op.f("ix_response_events_response_id"), table_name="response_events")
    op.drop_index(op.f("ix_response_events_information_event_id"), table_name="response_events")
    op.drop_index(op.f("ix_response_events_attempt_id"), table_name="response_events")
    op.drop_table("response_events")
    op.drop_index(op.f("ix_criterion_results_attempt_id"), table_name="criterion_results")
    op.drop_table("criterion_results")
    op.drop_index(op.f("ix_service_responses_service_id"), table_name="service_responses")
    op.drop_index(op.f("ix_service_responses_attempt_id"), table_name="service_responses")
    op.drop_table("service_responses")
    op.drop_index(op.f("ix_evaluations_supersedes_id"), table_name="evaluations")
    op.drop_index(op.f("ix_evaluations_ai_job_id"), table_name="evaluations")
    op.drop_table("evaluations")
    op.drop_index(op.f("ix_incident_cards_source_card_id"), table_name="incident_cards")
    op.drop_index(op.f("ix_incident_cards_classifier_version_id"), table_name="incident_cards")
    op.drop_index(op.f("ix_incident_cards_classifier_entry_id"), table_name="incident_cards")
    op.drop_table("incident_cards")
    op.drop_table("attempt_events")
    op.drop_index(op.f("ix_ai_jobs_scenario_version_id"), table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_poll", table_name="ai_jobs")
    op.drop_index(op.f("ix_ai_jobs_attempt_id"), table_name="ai_jobs")
    op.drop_table("ai_jobs")
    op.drop_index("ix_attempts_student_started", table_name="attempts")
    op.drop_index(op.f("ix_attempts_scenario_version_id"), table_name="attempts")
    op.drop_table("attempts")
    op.drop_index(op.f("ix_service_objects_territory_id"), table_name="service_objects")
    op.drop_table("service_objects")
    op.drop_index(op.f("ix_classifier_routes_service_id"), table_name="classifier_routes")
    op.drop_table("classifier_routes")
    op.drop_index(op.f("ix_assignments_student_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_scenario_version_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_lesson_id"), table_name="assignments")
    op.drop_table("assignments")
    op.drop_table("answer_keys")
    op.drop_index(op.f("ix_training_contacts_target_service_id"), table_name="training_contacts")
    op.drop_table("training_contacts")
    op.drop_table("service_territories")
    op.drop_index(op.f("ix_scenario_versions_service_profile_id"), table_name="scenario_versions")
    op.drop_index(
        op.f("ix_scenario_versions_classifier_version_id"), table_name="scenario_versions"
    )
    op.drop_table("scenario_versions")
    op.drop_index(op.f("ix_lessons_teacher_id"), table_name="lessons")
    op.drop_index(op.f("ix_lessons_group_id"), table_name="lessons")
    op.drop_table("lessons")
    op.drop_index(op.f("ix_group_memberships_user_id"), table_name="group_memberships")
    op.drop_table("group_memberships")
    op.drop_table("classifier_entries")
    op.drop_index(op.f("ix_user_services_service_id"), table_name="user_services")
    op.drop_table("user_services")
    op.drop_index(op.f("ix_training_groups_teacher_id"), table_name="training_groups")
    op.drop_table("training_groups")
    op.drop_table("service_profiles")
    op.drop_table("scenarios")
    op.drop_table("classifier_versions")
    op.drop_table("services")
