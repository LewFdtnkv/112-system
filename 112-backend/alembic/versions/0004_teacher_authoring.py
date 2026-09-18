"""add teacher card library and scenario composition

Revision ID: 0004_teacher_authoring
Revises: 0003_assignment_position
Create Date: 2026-09-18 23:41:37.444874
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_teacher_authoring"
down_revision: str | None = "0003_assignment_position"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_templates",
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("classifier_version_id", sa.Uuid(), nullable=False),
        sa.Column("classifier_entry_id", sa.Uuid(), nullable=False),
        sa.Column("caller_message", sa.Text(), nullable=True),
        sa.Column("instructions", sa.Text(), server_default="", nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["classifier_entry_id", "classifier_version_id"],
            ["classifier_entries.id", "classifier_entries.classifier_version_id"],
            name=op.f("fk_card_templates_classifier_entry_id_classifier_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["classifier_version_id"],
            ["classifier_versions.id"],
            name=op.f("fk_card_templates_classifier_version_id_classifier_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_card_templates_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_card_templates")),
    )
    op.create_index(
        op.f("ix_card_templates_classifier_entry_id"),
        "card_templates",
        ["classifier_entry_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_card_templates_classifier_version_id"),
        "card_templates",
        ["classifier_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_card_templates_created_by_id"), "card_templates", ["created_by_id"], unique=False
    )
    op.create_table(
        "card_template_recipients",
        sa.Column("card_template_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_template_id"],
            ["card_templates.id"],
            name=op.f("fk_card_template_recipients_card_template_id_card_templates"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_card_template_recipients_service_id_services"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "card_template_id", "service_id", name=op.f("pk_card_template_recipients")
        ),
    )
    op.create_index(
        op.f("ix_card_template_recipients_service_id"),
        "card_template_recipients",
        ["service_id"],
        unique=False,
    )
    op.create_table(
        "scenario_cards",
        sa.Column("scenario_version_id", sa.Uuid(), nullable=False),
        sa.Column("card_template_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("position > 0", name=op.f("ck_scenario_cards_positive_position")),
        sa.ForeignKeyConstraint(
            ["card_template_id"],
            ["card_templates.id"],
            name=op.f("fk_scenario_cards_card_template_id_card_templates"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_version_id"],
            ["scenario_versions.id"],
            name=op.f("fk_scenario_cards_scenario_version_id_scenario_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario_cards")),
        sa.UniqueConstraint("id", "scenario_version_id", name=op.f("uq_scenario_cards_id")),
        sa.UniqueConstraint(
            "scenario_version_id", "position", name=op.f("uq_scenario_cards_scenario_version_id")
        ),
    )
    op.create_index(
        op.f("ix_scenario_cards_card_template_id"),
        "scenario_cards",
        ["card_template_id"],
        unique=False,
    )
    op.add_column("assignments", sa.Column("scenario_card_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_assignments_scenario_card_id"), "assignments", ["scenario_card_id"], unique=False
    )
    op.create_foreign_key(
        op.f("fk_assignments_scenario_card_id_scenario_cards"),
        "assignments",
        "scenario_cards",
        ["scenario_card_id", "scenario_version_id"],
        ["id", "scenario_version_id"],
        ondelete="RESTRICT",
    )
    op.add_column("lessons", sa.Column("scenario_version_id", sa.Uuid(), nullable=True))
    op.add_column("lessons", sa.Column("start_request_id", sa.Uuid(), nullable=True))
    op.add_column("lessons", sa.Column("start_fingerprint", sa.String(length=64), nullable=True))
    op.create_index(
        op.f("ix_lessons_scenario_version_id"), "lessons", ["scenario_version_id"], unique=False
    )
    op.create_unique_constraint(
        op.f("uq_lessons_teacher_id"), "lessons", ["teacher_id", "start_request_id"]
    )
    op.create_foreign_key(
        op.f("fk_lessons_scenario_version_id_scenario_versions"),
        "lessons",
        "scenario_versions",
        ["scenario_version_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_lessons_scenario_version_id_scenario_versions"), "lessons", type_="foreignkey"
    )
    op.drop_constraint(op.f("uq_lessons_teacher_id"), "lessons", type_="unique")
    op.drop_index(op.f("ix_lessons_scenario_version_id"), table_name="lessons")
    op.drop_column("lessons", "start_fingerprint")
    op.drop_column("lessons", "start_request_id")
    op.drop_column("lessons", "scenario_version_id")
    op.drop_constraint(
        op.f("fk_assignments_scenario_card_id_scenario_cards"), "assignments", type_="foreignkey"
    )
    op.drop_index(op.f("ix_assignments_scenario_card_id"), table_name="assignments")
    op.drop_column("assignments", "scenario_card_id")
    op.drop_index(op.f("ix_scenario_cards_card_template_id"), table_name="scenario_cards")
    op.drop_table("scenario_cards")
    op.drop_index(
        op.f("ix_card_template_recipients_service_id"), table_name="card_template_recipients"
    )
    op.drop_table("card_template_recipients")
    op.drop_index(op.f("ix_card_templates_created_by_id"), table_name="card_templates")
    op.drop_index(op.f("ix_card_templates_classifier_version_id"), table_name="card_templates")
    op.drop_index(op.f("ix_card_templates_classifier_entry_id"), table_name="card_templates")
    op.drop_table("card_templates")
