"""Short student labels, popular shortcuts and explicit non-notifying types."""

import sqlalchemy as sa
from alembic import op

revision = "0011_classifier_presentation"
down_revision = "0010_bpmn_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("classifier_entries", sa.Column("display_name", sa.String(100)))
    op.add_column(
        "classifier_entries",
        sa.Column("is_popular", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "classifier_entries",
        sa.Column("popular_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "classifier_entries",
        sa.Column("notification_required", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_check_constraint(
        op.f("ck_classifier_entries_popular_order_nonnegative"),
        "classifier_entries",
        "popular_order >= 0",
    )
    # Only initialize presentation of our known synthetic v2 seed. Routing, codes,
    # snapshots and published source names are not rewritten.
    op.execute("""
        UPDATE classifier_entries e
        SET display_name = left(regexp_replace(e.name, '^Учебное: ', ''), 100)
        FROM classifier_versions v WHERE e.classifier_version_id = v.id
        AND v.label LIKE '%-synthetic-ekp-v2-36'
    """)
    for code, label, order in [
        ("TRAIN.02.01", "ДТП", 0),
        ("TRAIN.01.01", "Пожар", 1),
        ("TRAIN.04.01", "104", 3),
        ("TRAIN.06.01", "Человек в опасности", 4),
    ]:
        op.get_bind().execute(
            sa.text("""
            UPDATE classifier_entries e
            SET display_name=:label, is_popular=true, popular_order=:position
            FROM classifier_versions v WHERE e.classifier_version_id=v.id
            AND v.label LIKE '%-synthetic-ekp-v2-36' AND e.code=:code
        """),
            {"label": label, "position": order, "code": code},
        )


def downgrade():
    op.drop_constraint(
        op.f("ck_classifier_entries_popular_order_nonnegative"), "classifier_entries", type_="check"
    )
    for name in ("notification_required", "popular_order", "is_popular", "display_name"):
        op.drop_column("classifier_entries", name)
