"""Enforce mutually exclusive system roles without rewriting existing accounts."""

from alembic import op

revision = "0007_exclusive_user_role"
down_revision = "0006_frontend_scenarios"
branch_labels = None
depends_on = None


def upgrade():
    # Existing mixed accounts must be resolved explicitly; never silently grant/revoke rights.
    op.create_check_constraint("exclusive_role", "users", "NOT (is_teacher AND is_admin)")


def downgrade():
    op.drop_constraint(op.f("ck_users_exclusive_role"), "users", type_="check")
