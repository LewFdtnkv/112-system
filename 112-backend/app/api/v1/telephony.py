import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminDep, SessionDep, StudentDep, TeacherDep
from app.core.config import settings
from app.models import Assignment, Lesson, TelephonyStation, TrainingCall, User
from app.schemas.telephony import CallRead, CallStart, StationCreate, StationRead, StationUpdate
from app.services.student.access import owned_attempt
from app.services.telephony import calls

router = APIRouter(prefix="/telephony", tags=["telephony"])


def station_read(station):
    return StationRead.model_validate(station, from_attributes=True)


async def valid_student(session, student_id):
    if student_id:
        user = await session.get(User, student_id)
        if not user or not user.is_active or user.is_admin or user.is_teacher:
            raise HTTPException(422, "Выберите активного ученика")


@router.get("/stations", response_model=list[StationRead])
async def stations(session: SessionDep, admin: AdminDep):
    return list(await session.scalars(select(TelephonyStation).order_by(TelephonyStation.name)))


@router.post("/stations", response_model=StationRead, status_code=201)
async def create_station(payload: StationCreate, session: SessionDep, admin: AdminDep):
    await valid_student(session, payload.student_id)
    station = TelephonyStation(**payload.model_dump(), sip_password=secrets.token_urlsafe(32))
    session.add(station)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            409, "Этот телефон или ученик уже закреплён за рабочим местом"
        ) from None
    return station


@router.patch("/stations/{station_id}", response_model=StationRead)
async def update_station(
    station_id: UUID, payload: StationUpdate, session: SessionDep, admin: AdminDep
):
    station = await session.scalar(
        select(TelephonyStation).where(TelephonyStation.id == station_id).with_for_update()
    )
    if not station:
        raise HTTPException(404, "Рабочее место не найдено")
    if await calls.active_call(session, station.id):
        raise HTTPException(409, "Сначала завершите звонок рабочего места")
    await valid_student(session, payload.student_id)
    station.student_id = payload.student_id
    station.enabled = payload.enabled
    station.attempt_id = None
    station.provisioned = False
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Ученик уже закреплён за другим рабочим местом") from None
    return station


@router.get("/stations/{station_id}/credentials")
async def credentials(station_id: UUID, session: SessionDep, admin: AdminDep, response: Response):
    station = await session.get(TelephonyStation, station_id)
    if not station or station.mode == "external":
        raise HTTPException(404, "SIP-учётная запись не управляется тренажёром")
    response.headers["Cache-Control"] = "no-store"
    return {
        "username": station.endpoint,
        "password": station.sip_password,
        "domain": settings.telephony_sip_domain,
        "ws_url": settings.telephony_ws_url,
        "dial_number": "9000",
    }


@router.post("/attempts/{attempt_id}/bind", response_model=StationRead)
async def bind(attempt_id: UUID, session: SessionDep, student: StudentDep):
    return await calls.bind(session, attempt_id, student.id)


@router.get("/attempts/{attempt_id}")
async def state(attempt_id: UUID, session: SessionDep, student: StudentDep):
    attempt, _ = await owned_attempt(session, attempt_id, student.id)
    station = await session.scalar(
        select(TelephonyStation).where(TelephonyStation.student_id == student.id)
    )
    history = list(
        await session.scalars(
            select(TrainingCall)
            .where(TrainingCall.attempt_id == attempt.id)
            .order_by(TrainingCall.started_at.desc())
            .limit(100)
        )
    )
    return {
        "active_call": CallRead.model_validate(active, from_attributes=True)
        if station and (active := await calls.active_call(session, station.id))
        else None,
        "enabled": settings.telephony_enabled,
        "station": station_read(station) if station else None,
        "cues": [
            {
                "id": c.id,
                "name": c.contact_name,
                "contact_key": c.contact_key,
                "status": a.status,
                "duration_seconds": a.duration_seconds,
            }
            for c, a in await calls.available_cues(session, attempt)
        ],
        "calls": [CallRead.model_validate(c, from_attributes=True) for c in history],
    }


@router.get("/attempts/{attempt_id}/sip")
async def sip(attempt_id: UUID, session: SessionDep, student: StudentDep, response: Response):
    attempt, _ = await owned_attempt(session, attempt_id, student.id)
    station = await calls.station_for(session, student.id)
    if (
        not settings.telephony_enabled
        or station.mode != "browser"
        or not station.provisioned
        or station.attempt_id != attempt.id
        or attempt.status != "in_progress"
    ):
        raise HTTPException(409, "Сначала подключите браузерное рабочее место")
    response.headers["Cache-Control"] = "no-store"
    return {
        "username": station.endpoint,
        "password": station.sip_password,
        "domain": settings.telephony_sip_domain,
        "ws_url": settings.telephony_ws_url,
    }


@router.post("/attempts/{attempt_id}/calls", response_model=CallRead, status_code=201)
async def start(attempt_id: UUID, payload: CallStart, session: SessionDep, student: StudentDep):
    return await calls.start(session, attempt_id, student.id, payload)


@router.post("/attempts/{attempt_id}/calls/{call_id}/cancel", response_model=CallRead)
async def cancel(attempt_id: UUID, call_id: UUID, session: SessionDep, student: StudentDep):
    await owned_attempt(session, attempt_id, student.id)
    station = await calls.station_for(session, student.id, lock=True)
    call = await session.get(TrainingCall, call_id)
    if not call or call.attempt_id != attempt_id or call.station_id != station.id:
        raise HTTPException(404, "Звонок не найден")
    if station.mode == "external":
        if call.provider_call_id:
            raise HTTPException(409, "Завершите разговор на физическом телефоне")
        if call.status in calls.ACTIVE:
            await calls.record_event(
                session,
                call,
                f"cancel:{call.id}",
                "no_answer",
                datetime.now(UTC),
                payload={"source": "controller"},
            )
    call.cancel_requested = True
    await session.commit()
    return call


@router.get("/lessons/{lesson_id}/calls", response_model=list[CallRead])
async def lesson_calls(lesson_id: UUID, session: SessionDep, teacher: TeacherDep):
    lesson = await session.get(Lesson, lesson_id)
    if not lesson or lesson.teacher_id != teacher.id:
        raise HTTPException(404, "Занятие не найдено")
    from app.models import Attempt

    return list(
        await session.scalars(
            select(TrainingCall)
            .join(Attempt)
            .join(Assignment, Assignment.id == Attempt.assignment_id)
            .where(Assignment.lesson_id == lesson_id)
            .order_by(TrainingCall.started_at.desc())
            .limit(500)
        )
    )
