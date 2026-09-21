"""Удалить старые искусственные справочники и связанные учебные данные.

По умолчанию только план. Перед --apply сделайте pg_dump. Новые/смешанные
справочники и данные вне выбранных справочников защищены проверками связей.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import and_, delete, select, text, tuple_  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import session_factory  # noqa: E402
from app.models import (  # noqa: E402
    AIJob,
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    Service,
)

OLD_SERVICES = {
    "fire",
    "gas",
    "medical",
    "police",
    "power",
    "rescue",
    "utility",
    "test-service",
}


def selected(table, keys):
    return tuple_(*table.primary_key.columns).in_(list(keys))


async def descendants(session, roots):
    tables = Base.metadata.sorted_tables
    keys = {t.name: set(roots.get(t.name, ())) for t in tables}
    changed = True
    while changed:
        changed = False
        for table in tables:
            for constraint in table.foreign_key_constraints:
                parent = constraint.referred_table
                if not keys[parent.name]:
                    continue
                alias = parent.alias()
                join = and_(*(e.parent == alias.c[e.column.name] for e in constraint.elements))
                rows = await session.execute(
                    select(*table.primary_key.columns)
                    .select_from(table.join(alias, join))
                    .where(
                        tuple_(*(alias.c[c.name] for c in parent.primary_key.columns)).in_(
                            list(keys[parent.name])
                        )
                    )
                )
                found = {tuple(r) for r in rows} - keys[table.name]
                if found:
                    keys[table.name].update(found)
                    changed = True
    return keys


async def cleanup(session, *, prefix="demo", apply=False):
    # Block concurrent authoring/worker writes while computing and applying the exact plan.
    if apply:
        names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
        await session.execute(text(f"LOCK TABLE {names} IN SHARE ROW EXCLUSIVE MODE"))
    old_services = list(
        await session.scalars(
            select(Service).where(
                Service.code.in_([f"{prefix}-{suffix}" for suffix in OLD_SERVICES])
            )
        )
    )
    if any(
        not (s.name.startswith("Учебн") or s.name.startswith("Тестовая служба"))
        for s in old_services
    ):
        raise RuntimeError("Имя старой службы изменено: нужна ручная проверка перед удалением")
    service_ids = {s.id for s in old_services}
    versions = []
    for version in await session.scalars(select(ClassifierVersion)):
        entries = list(
            await session.scalars(
                select(ClassifierEntry).where(ClassifierEntry.classifier_version_id == version.id)
            )
        )
        if not entries or not all(e.code.startswith(("DEMO.", "TRAIN.")) for e in entries):
            continue
        routes = list(
            await session.scalars(
                select(ClassifierRoute).where(ClassifierRoute.entry_id.in_([e.id for e in entries]))
            )
        )
        if routes and all(r.service_id in service_ids for r in routes):
            versions.append(version.id)
    roots = {
        "classifier_versions": {(v,) for v in versions},
        "services": {(s,) for s in service_ids},
    }
    # Queued generation jobs reference the catalog in JSON, not a foreign key.
    roots["ai_jobs"] = {
        (job.id,)
        for job in await session.scalars(select(AIJob))
        if str(job.input.get("card", {}).get("classifier_version_id")) in {str(v) for v in versions}
    }
    keys = await descendants(session, roots)
    tables = Base.metadata.tables
    # Do not remove a mixed scenario/card/catalog merely because it references an old service.
    for name, parent_name, column in (
        ("classifier_entries", "classifier_versions", "classifier_version_id"),
        ("classifier_routes", "classifier_entries", "entry_id"),
        ("card_templates", "classifier_versions", "classifier_version_id"),
        ("card_template_recipients", "card_templates", "card_template_id"),
        ("scenario_versions", "classifier_versions", "classifier_version_id"),
        ("scenario_cards", "scenario_versions", "scenario_version_id"),
        ("lessons", "scenario_versions", "scenario_version_id"),
        ("incident_cards", "classifier_versions", "classifier_version_id"),
    ):
        table = tables[name]
        values = await session.scalars(select(table.c[column]).where(selected(table, keys[name])))
        if any((value,) not in keys[parent_name] for value in values):
            raise RuntimeError(f"Старые данные используются вне тестового набора: {name}")
    # Remove empty scenario containers; keep those with any unrelated version.
    scenario = tables["scenarios"]
    for sid in await session.scalars(select(scenario.c.id)):
        children = set(
            await session.scalars(
                select(tables["scenario_versions"].c.id).where(
                    tables["scenario_versions"].c.scenario_id == sid
                )
            )
        )
        if children and all((vid,) in keys["scenario_versions"] for vid in children):
            roots.setdefault("scenarios", set()).add((sid,))
    keys = await descendants(session, roots)
    # Account/group cleanup is optional: never drag unrelated lessons or cards into deletion.
    users = tables["users"]
    candidates = [
        ("training_groups", (gid,))
        for gid in await session.scalars(
            select(tables["training_groups"].c.id)
            .join(users, users.c.id == tables["training_groups"].c.teacher_id)
            .where(
                users.c.username == f"{prefix}-teacher",
                tables["training_groups"].c.name.startswith(prefix + ":"),
            )
        )
    ]
    candidates += [
        ("users", (uid,))
        for uid in await session.scalars(
            select(users.c.id)
            .where(
                users.c.username.in_([f"{prefix}-student", f"{prefix}-teacher"]),
                users.c.is_admin.is_(False),
            )
            .order_by(users.c.is_teacher, users.c.id)
        )
    ]
    safe_extras = {
        "users",
        "training_groups",
        "group_memberships",
        "auth_sessions",
        "user_photos",
        "user_activities",
        "message_recipients",
    }
    kept = []
    for name, key in candidates:
        proposal = {n: set(v) for n, v in roots.items()}
        proposal.setdefault(name, set()).add(key)
        expanded = await descendants(session, proposal)
        allowed = safe_extras | ({"teaching_messages"} if name == "training_groups" else set())
        if name == "users":
            extra_messages = expanded["teaching_messages"] - keys["teaching_messages"]
            messages = tables["teaching_messages"]
            recipients = tables["message_recipients"]
            groups = list(
                await session.scalars(
                    select(messages.c.group_id).where(selected(messages, extra_messages))
                )
            )
            student_ids = list(
                await session.scalars(
                    select(recipients.c.student_id).where(
                        recipients.c.message_id.in_([k[0] for k in extra_messages])
                    )
                )
            )
            if all(g is None or (g,) in keys["training_groups"] for g in groups) and all(
                (u,) in expanded["users"] for u in student_ids
            ):
                allowed.add("teaching_messages")
        if any(expanded[n] - keys[n] for n in expanded if n not in allowed):
            kept.append(name)
            continue
        roots, keys = proposal, expanded
    report = {name: len(rows) for name, rows in keys.items() if rows}
    if apply:
        for table in reversed(Base.metadata.sorted_tables):
            if keys[table.name]:
                await session.execute(delete(table).where(selected(table, keys[table.name])))
        await session.commit()
    return {"applied": apply, "records": report, "preserved_with_other_data": kept}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", default="demo")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    async with session_factory() as session:
        result = await cleanup(session, prefix=args.prefix, apply=args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
