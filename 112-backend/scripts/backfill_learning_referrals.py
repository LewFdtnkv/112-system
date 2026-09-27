"""Issue referrals for existing, still-valid advice; never renew old recommendations."""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.db.session import session_factory
from app.models import AIJob, TeachingMessage, User
from app.services.learning_recommendations.profile import build_profile
from app.services.learning_recommendations.referrals import issue_referrals


async def backfill(session):
    pairs = list(
        (
            await session.execute(
                select(TeachingMessage.id, AIJob.student_id)
                .join(AIJob, AIJob.id == TeachingMessage.ai_job_id)
                .where(TeachingMessage.source == "learning_advice")
                .order_by(AIJob.student_id, TeachingMessage.id)
            )
        ).all()
    )
    issued = 0
    for message_id, student_id in pairs:
        student = await session.scalar(select(User).where(User.id == student_id).with_for_update())
        if not student or not student.is_active or student.role != "student":
            continue
        message = await session.scalar(
            select(TeachingMessage).where(TeachingMessage.id == message_id).with_for_update()
        )
        profile = await build_profile(session, student_id, message.details["role"])
        if any(
            profile["sources"].get(k) != v for k, v in message.details.get("sources", {}).items()
        ):
            continue
        job = await session.get(AIJob, message.ai_job_id)
        materials = [
            m
            for m in job.context.get("materials", {}).get("examples", [])
            if m["id"] in job.output.get("selected_ids", [])
        ]
        issued += await issue_referrals(session, message, student_id, materials)
    return issued


async def main(apply):
    async with session_factory() as session:
        count = await backfill(session)
        if apply:
            await session.commit()
        else:
            await session.rollback()
        print(f"{'Создано' if apply else 'Будет создано'} направлений: {count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Сохранить направления; иначе пробный запуск"
    )
    asyncio.run(main(parser.parse_args().apply))
