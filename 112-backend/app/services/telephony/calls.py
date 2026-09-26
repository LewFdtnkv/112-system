import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models import (
    Assignment,
    Attempt,
    CallCue,
    Lesson,
    ServiceResponse,
    SpeechAsset,
    TelephonyEvent,
    TelephonyStation,
    TrainingCall,
    TrainingContact,
    User,
)
from app.models.enums import AttemptStatus, CallStatus
from app.services.audit import append_event
from app.services.lesson_clock import execution_deadline
from app.services.lesson_presence import execution_for
from app.services.student.access import owned_attempt
from app.services.telephony.crew_notifications import required, selected_crew
from app.services.telephony.media import audio_path
from app.services.telephony.voice_pack import choose_dialogue

ACTIVE = [CallStatus.DIALING, CallStatus.CONNECTED]
TERMINAL = ["ended", "busy", "no_answer", "failed"]


async def binding_is_active(session, station, attempt):
    if (
        not settings.telephony_enabled
        or not station.enabled
        or not attempt
        or station.attempt_id != attempt.id
        or station.student_id != attempt.student_id
        or attempt.status != AttemptStatus.IN_PROGRESS
    ):
        return False
    user = await session.get(User, attempt.student_id)
    if not user or not user.is_active or user.is_admin or user.is_teacher:
        return False
    assignment = await session.get(Assignment, attempt.assignment_id)
    lesson = await session.get(Lesson, assignment.lesson_id)

    execution = await execution_for(session, lesson.id, attempt.student_id)
    if execution and (execution.paused_at or execution.ended_at):
        return False
    deadline = execution_deadline(lesson, execution)
    return lesson.status == "active" and (deadline is None or datetime.now(UTC) < deadline)


async def active_call(session, station_id):
    return await session.scalar(
        select(TrainingCall).where(
            TrainingCall.station_id == station_id, TrainingCall.status.in_(ACTIVE)
        )
    )


async def station_for(session, student_id, *, lock=False):
    query = select(TelephonyStation).where(
        TelephonyStation.student_id == student_id, TelephonyStation.enabled.is_(True)
    )
    if lock:
        query = query.with_for_update()
    station = await session.scalar(query)
    if not station:
        raise HTTPException(409, "Администратор должен закрепить за вами телефонное рабочее место")
    return station


async def bind(session, attempt_id, student_id):
    attempt, _ = await owned_attempt(session, attempt_id, student_id, lock=True)
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(409, "Занятие уже завершено")
    station = await station_for(session, student_id, lock=True)
    if station.attempt_id != attempt.id:
        if await active_call(session, station.id):
            raise HTTPException(409, "Сначала завершите текущий звонок")
        station.attempt_id = attempt.id
        await append_event(
            session,
            attempt.id,
            "telephony.bound",
            {
                "station_id": str(station.id),
                "mode": station.mode,
            },
        )
    await session.commit()
    return station


async def available_cues(session, attempt):
    assignment = await session.get(Assignment, attempt.assignment_id)
    return list(
        (
            await session.execute(
                select(CallCue, SpeechAsset)
                .join(SpeechAsset, SpeechAsset.id == CallCue.audio_id)
                .where(
                    CallCue.scenario_card_id == assignment.scenario_card_id,
                    CallCue.contact_key != "caller"
                    if "dds_policy" in attempt.settings_snapshot
                    else True,
                )
                .order_by(CallCue.contact_name)
            )
        ).all()
    )


def request_key(cue_id, direction, transport, crew_code=None):
    value = f"{cue_id}:{direction}:{transport}"
    if crew_code:
        value += f":{crew_code}"
    return hashlib.sha256(value.encode()).hexdigest()


async def new_call(
    session,
    station,
    attempt,
    cue,
    *,
    command_id,
    direction,
    transport,
    require_audio=True,
    crew_code=None,
):
    if "dds_policy" in attempt.settings_snapshot and cue.contact_key == "caller":
        raise HTTPException(422, "Звонки заявителю не входят в занятия ДДС")
    dialogue = None
    if required(attempt):
        if direction != "outgoing" or transport != "manual":
            raise HTTPException(422, "Руководителю бригады должен позвонить сам оператор")
        if station.mode == "external":
            raise HTTPException(
                409,
                "Для проверки речи нужен Asterisk; внешний адаптер пока передаёт только соединение",
            )
        binding = await selected_crew(session, attempt, cue.contact_key, crew_code)
        dialogue = choose_dialogue() | binding
    asset = await session.get(SpeechAsset, cue.audio_id)
    if require_audio and (
        asset.status != "ready" or not asset.file_key or not audio_path(asset.file_key).is_file()
    ):
        raise HTTPException(409, "Запись ещё не подготовлена. Обратитесь к преподавателю")
    if await active_call(session, station.id):
        raise HTTPException(409, "На рабочем месте уже есть активный звонок")
    contact = None
    if cue.contact_key != "caller":
        profile_id = attempt.settings_snapshot.get("service_profile", {}).get("id")
        contact = await session.scalar(
            select(TrainingContact).where(
                TrainingContact.profile_id == profile_id, TrainingContact.code == cue.contact_key
            )
        )
        if contact is None:
            raise HTTPException(409, "Контакт не принадлежит профилю занятия")
    response = None
    if contact:
        response = await session.scalar(
            select(ServiceResponse).where(
                ServiceResponse.attempt_id == attempt.id,
                ServiceResponse.service_id == contact.target_service_id,
            )
        )
    row = TrainingCall(
        attempt_id=attempt.id,
        station_id=station.id,
        initiated_by_id=attempt.student_id,
        command_id=command_id,
        request_fingerprint=request_key(cue.id, direction, transport, crew_code),
        dialogue=dialogue,
        contact_id=contact.id if contact else None,
        response_id=response.id if response else None,
        target_service_id=contact.target_service_id if contact else None,
        contact_name=cue.contact_name,
        target_service_name=response.service_name if response else "",
        endpoint_key=contact.endpoint_key if contact else "caller",
        audio_id=asset.id if asset.status == "ready" else None,
        direction=direction,
        transport=transport,
        provider=station.provider,
    )
    session.add(row)
    await session.flush()
    await append_event(
        session,
        attempt.id,
        "call.requested",
        {
            "call_id": str(row.id),
            "station_id": str(station.id),
            "contact": cue.contact_name,
            "endpoint_key": row.endpoint_key,
            "direction": direction,
            "mode": station.mode,
            "audio_id": str(row.audio_id) if row.audio_id else None,
        },
    )
    return row


async def start(session, attempt_id, student_id, payload):
    if not settings.telephony_enabled:
        raise HTTPException(409, "Телефония отключена администратором")
    attempt, _ = await owned_attempt(session, attempt_id, student_id, lock=True)
    station = await station_for(session, student_id, lock=True)
    existing = await session.scalar(
        select(TrainingCall).where(
            TrainingCall.attempt_id == attempt.id, TrainingCall.command_id == payload.command_id
        )
    )
    if existing:
        if existing.request_fingerprint != request_key(
            payload.cue_id, payload.direction, payload.transport, payload.crew_code
        ):
            raise HTTPException(409, "Команда уже использована с другими параметрами")
        return existing
    if attempt.status != AttemptStatus.IN_PROGRESS or station.attempt_id != attempt.id:
        raise HTTPException(409, "Сначала подключите рабочее место к активной карточке")
    if station.mode != "external" and not station.provisioned:
        raise HTTPException(409, "Asterisk ещё не подготовил рабочее место")
    if station.mode == "external" and (
        payload.transport != "manual" or payload.direction != "outgoing"
    ):
        raise HTTPException(
            422, "Внешняя АТС: набор с телефона, управление вызовом выполняет её адаптер"
        )
    if payload.direction == "incoming" and payload.transport != "callback":
        raise HTTPException(422, "Для входящего звонка нужен вызов телефона")
    cue = next(
        (c for c, _ in await available_cues(session, attempt) if c.id == payload.cue_id), None
    )
    if not cue:
        raise HTTPException(404, "Контакт сценария не найден")
    row = await new_call(
        session,
        station,
        attempt,
        cue,
        command_id=payload.command_id,
        direction=payload.direction,
        transport=payload.transport,
        require_audio=station.mode != "external",
        crew_code=payload.crew_code,
    )
    await session.commit()
    return row


async def record_event(session, call, event_id, kind, occurred_at, *, payload=None):
    # The station lock serializes duplicate events and call creation from UI / adapters.
    existing = await session.scalar(
        select(TelephonyEvent).where(
            TelephonyEvent.provider == call.provider, TelephonyEvent.event_id == event_id
        )
    )
    if existing:
        if (
            existing.call_id != call.id
            or existing.kind != kind
            or existing.occurred_at != occurred_at
        ):
            raise HTTPException(409, "Event ID already used")
        return
    if occurred_at > datetime.now(UTC) + timedelta(seconds=60):
        raise HTTPException(422, "Event is in the future")
    event = TelephonyEvent(
        call_id=call.id,
        provider=call.provider,
        event_id=event_id,
        kind=kind,
        occurred_at=occurred_at,
        payload=payload or {},
    )
    session.add(event)
    await session.flush()
    events = list(
        await session.scalars(
            select(TelephonyEvent)
            .where(TelephonyEvent.call_id == call.id)
            .order_by(TelephonyEvent.occurred_at, TelephonyEvent.id)
        )
    )
    # Recompute from durable evidence: retries and out-of-order delivery never reopen calls.
    call.started_at = min(call.started_at, *(e.occurred_at for e in events))
    connected = [e.occurred_at for e in events if e.kind == "connected"]
    ends = [e for e in events if e.kind in TERMINAL]
    call.connected_at = min(connected) if connected else None
    if ends:
        last = max(ends, key=lambda e: e.occurred_at)
        if call.connected_at and call.connected_at > last.occurred_at:
            call.connected_at = None  # Late contradictory event, retained as raw evidence only.
        call.ended_at = last.occurred_at
        call.status = (
            CallStatus.ENDED
            if call.connected_at and last.kind != "failed"
            else CallStatus(last.kind)
        )
    elif connected:
        call.status = CallStatus.CONNECTED
    await append_event(
        session,
        call.attempt_id,
        f"call.{kind}",
        {
            "call_id": str(call.id),
            "provider": call.provider,
            "event_id": event_id,
            "provider_occurred_at": occurred_at.isoformat(),
            "source": "pbx",
            **(payload or {}),
        },
    )


def provider_key(provider, call_id):
    return hashlib.sha256(f"{provider}\0{call_id}".encode()).hexdigest()


async def external_event(session, provider, event):
    if provider == "local":
        raise HTTPException(403, "Local ARI events cannot be submitted by external adapters")
    station = await session.scalar(
        select(TelephonyStation)
        .where(
            TelephonyStation.provider == provider,
            TelephonyStation.endpoint == event.endpoint,
        )
        .with_for_update()
    )
    if not station:
        raise HTTPException(404, "Unknown PBX endpoint")
    key = provider_key(provider, event.provider_call_id)
    call = await session.scalar(select(TrainingCall).where(TrainingCall.provider_call_id == key))
    if not call and event.call_id:
        call = await session.get(TrainingCall, event.call_id)
        if not call:
            raise HTTPException(404, "Unknown call ID")
        if call.provider_call_id not in (None, key):
            raise HTTPException(409, "Call is already linked to another PBX call")
    if not call:
        attempt = await session.get(Attempt, station.attempt_id) if station.attempt_id else None
        if (
            not await binding_is_active(session, station, attempt)
            or event.attempt_id != attempt.id
            or event.occurred_at < attempt.started_at
        ):
            raise HTTPException(409, "No active workstation binding")
        cue = next(
            (
                c
                for c, _ in await available_cues(session, attempt)
                if c.contact_key == event.contact_key
            ),
            None,
        )
        if not cue:
            raise HTTPException(422, "Unknown scenario contact; do not infer it from caller ID")
        call = await new_call(
            session,
            station,
            attempt,
            cue,
            command_id=uuid4(),
            direction=event.direction,
            transport="manual",
            require_audio=False,
        )
    if (
        (event.call_id is not None and event.call_id != call.id)
        or call.station_id != station.id
        or call.provider != provider
        or call.direction != event.direction
    ):
        raise HTTPException(409, "PBX call does not match its workstation or direction")
    call.provider_call_id = key
    await record_event(session, call, event.event_id, event.kind, event.occurred_at)
    await session.commit()
    return call
