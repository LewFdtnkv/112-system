"""QA4 work decisions and separate first record clock; preserve historical snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0034_dds_qa4"
down_revision = "0033_card_recordings"
branch_labels = depends_on = None

OLD = "status IN ('assigned','responding','arrived','in_progress','completed','cancelled')"
NEW = (
    "status IN ('assigned','accepted','not_accepted','responding','arrived',"
    "'in_progress','completed','refused','cancelled')"
)


def upgrade():
    op.add_column("attempts", sa.Column("first_record_at", sa.DateTime(timezone=True)))
    op.drop_constraint(op.f("ck_crew_assignments_valid_status"), "crew_assignments", type_="check")
    op.create_check_constraint("valid_status", "crew_assignments", NEW)
    op.create_check_constraint(
        "refusal_reason",
        "crew_assignments",
        "status NOT IN ('not_accepted','refused') OR length(btrim(comment)) > 0",
    )
    op.execute("""UPDATE card_templates
        SET dds_exercise = dds_exercise || '{"workflow":"crews-v1"}'::jsonb
        WHERE dds_exercise IS NOT NULL AND NOT dds_exercise ? 'workflow'""")
    op.execute("""UPDATE scenario_cards
        SET snapshot = jsonb_set(snapshot, '{dds_exercise,workflow}', '"crews-v1"')
        WHERE jsonb_typeof(snapshot->'dds_exercise') = 'object'
        AND NOT (snapshot->'dds_exercise') ? 'workflow'""")


def downgrade():
    # New snapshots must not be reinterpreted by an older application.
    if op.get_bind().scalar(
        sa.text("""SELECT
        (SELECT count(*) FROM card_templates WHERE dds_exercise->>'workflow' = 'crews-v2') +
        (SELECT count(*) FROM scenario_cards
         WHERE snapshot->'dds_exercise'->>'workflow' = 'crews-v2')""")
    ):
        raise RuntimeError("QA4 snapshots exist; downgrade would lose their semantics")
    op.execute(
        "UPDATE card_templates SET dds_exercise = dds_exercise - 'workflow' "
        "WHERE dds_exercise->>'workflow' = 'crews-v1'"
    )
    op.execute("""UPDATE scenario_cards SET snapshot = jsonb_set(snapshot, '{dds_exercise}',
        (snapshot->'dds_exercise') - 'workflow')
        WHERE snapshot->'dds_exercise'->>'workflow' = 'crews-v1'""")
    # Refuse lossy downgrade when new decisions already exist.
    op.drop_constraint(
        op.f("ck_crew_assignments_refusal_reason"), "crew_assignments", type_="check"
    )
    op.drop_constraint(op.f("ck_crew_assignments_valid_status"), "crew_assignments", type_="check")
    op.create_check_constraint("valid_status", "crew_assignments", OLD)
    op.drop_column("attempts", "first_record_at")
