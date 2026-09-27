"""DDS demo lessons through the same commands and assessment as a real student."""

from uuid import NAMESPACE_URL, UUID, uuid5

STEPS = [
    {
        "status": "accepted",
        "message": (
            "Карточка направлена вашей службе. Для реагирования "
            "назначьте учебный пожарный расчёт № 1, наряд УЧ-101."
        ),
    },
    {
        "status": "responding",
        "message": "Старший расчёта № 1 сообщает: наряд УЧ-101 выехал к месту пожара.",
        "crew_number": "УЧ-101",
    },
    {
        "status": "arrived",
        "message": "Старший расчёта № 1 сообщает: наряд УЧ-101 прибыл на место.",
        "crew_number": "УЧ-101",
    },
    {
        "status": "in_progress",
        "message": "Старший расчёта № 1 сообщает: наряд УЧ-101 приступил к тушению.",
        "crew_number": "УЧ-101",
    },
    {
        "status": "completed",
        "message": (
            "Старший расчёта № 1 сообщает: наряд УЧ-101 ликвидировал пожар, "
            "работы завершены. Зафиксируйте завершение работ расчёта. Статус службы не меняйте."
        ),
        "crew_number": "УЧ-101",
    },
]


def card_exercise(profile_id, *, continuing=False, phone=False):
    history = (
        [
            {
                "status": status,
                "seconds_before_start": seconds,
                "crew_number": "УЧ-101",
                "comment": message,
            }
            for status, seconds, message in (
                ("assigned", 300, "Расчёт назначен, руководитель оповещён предыдущей сменой."),
                ("accepted", 240, "Карточка принята в работу."),
                ("responding", 180, "Расчёт выехал."),
                ("arrived", 60, "Прибыли по адресу."),
            )
        ]
        if continuing
        else []
    )
    messages = (
        [STEPS[0]["message"]] if phone else [s["message"] for s in STEPS[3 if continuing else 0 :]]
    )
    return {
        "workflow": "crews-v2",
        "service_profile_id": str(profile_id),
        "initial_crews": [{"crew_code": "fire-1", "history": history}] if history else [],
        "required_crews": [{"crew_code": "fire-1", "status": "assigned" if phone else "completed"}],
        "crew_calls_required": phone,
        "messages": [{"crew_code": "fire-1", "message": m} for m in messages],
    }


async def populate_dds(
    gateway, state, create, group_id, card_ids, service_id, with_crew_calls=False, source_cards=None
):
    prefix = state.data["prefix"]
    profile_id = await create(
        "dds-profile",
        "admin/service-profiles",
        {
            "service_id": service_id,
            "name": f"{prefix}: учебная пожарная ДДС",
            "responsibility": (
                "Учебная территория: Москва, Учебная улица. Только имитация реагирования."
            ),
            "procedure": (
                "Назначить расчёт № 1 и обновлять его статусы по сведениям старшего. "
                "После фиксации результатов завершить упражнение. "
                "Служба остаётся в статусе «Добавлена»."
            ),
            "crews": [
                {
                    "code": "fire-1",
                    "name": "Учебный пожарный расчёт № 1",
                    "description": "Основной расчёт, учебный наряд УЧ-101",
                },
                {
                    "code": "fire-reserve",
                    "name": "Учебный резервный расчёт",
                    "description": "Резерв: назначается только при дополнительных указаниях",
                },
            ],
        },
    )
    await gateway.publish(profile_id)
    dds_card_ids = []
    for i, source in enumerate(source_cards or [], start=1):
        dds_card_ids.append(
            await create(
                f"dds-card-v3-{i}",
                "cards",
                source
                | {
                    "title": f"{prefix}: ДДС — "
                    + ("продолжение работы" if i == 1 else "новая карточка"),
                    "instructions": "",
                    "dds_exercise": card_exercise(profile_id, continuing=i == 1),
                },
            )
        )
    scenario_id = await create(
        "dds-scenario-v3",
        "scenarios",
        {
            "title": f"{prefix}: ДДС — пожар и работа расчёта",
            "role": "dds",
            "card_ids": dds_card_ids[:2] or card_ids[:2],
            "arrival_offsets_seconds": [0] * len(card_ids[:2]),
            "service_profile_id": profile_id,
            "instructions": (
                "Учебная имитация: обработайте обе карточки. Выберите свою "
                "службу в нижней панели. Изучите исходную историю и обновляйте "
                "статусы расчёта по сведениям старшего. Статус службы не меняйте. "
                "Резервный расчёт не требуется."
            ),
            "dds_policy": None
            if dds_card_ids
            else {
                "workflow": "crews-v1",
                "steps": STEPS,
                "required_crews": [{"crew_code": "fire-1", "status": "completed"}],
            },
        },
    )
    await gateway.use_student(state.data["accounts"]["student"])
    lessons = {}
    for kind, title in (
        ("completed", "ДДС — завершённое занятие с оценкой"),
        ("active", "ДДС — практика работы с расчётами"),
    ):
        lesson_id = await create(
            f"dds-lesson-v3-{kind}",
            "lessons/start",
            {
                "request_id": str(
                    uuid5(NAMESPACE_URL, f"source-demo/{prefix}/{scenario_id}/{kind}")
                ),
                "group_id": group_id,
                "scenario_version_id": scenario_id,
                "title": f"{prefix}: {title}",
                "learning": {"kind": "practice"},
            },
        )
        lessons[kind] = lesson_id
        work = await gateway.lesson(lesson_id)
        if kind == "completed":
            for assignment in work["assignments"]:
                if assignment["status"] == "completed":
                    continue
                attempt = await gateway.start(assignment["id"])
                await complete_attempt(gateway, attempt)
        elif all(a["status"] == "pending" for a in work["assignments"]):
            # Start only: leave real student progress untouched on subsequent seed runs.
            await gateway.start(work["assignments"][0]["id"])
    if with_crew_calls:
        lessons["phone"] = await populate_crew_call_lesson(
            create, gateway.publish, prefix, group_id, card_ids, service_id, source_cards
        )
    await gateway.logout()
    return {"profile_id": profile_id, "scenario_id": scenario_id, "lessons": lessons}


async def populate_crew_call_lesson(
    create, publish, prefix, group_id, card_ids, service_id, source_cards=None
):
    """Additive plan shared by the unified seed and stand preparation; no fake PBX events."""
    phone_profile = await create(
        "dds-phone-profile",
        "admin/service-profiles",
        {
            "service_id": service_id,
            "name": f"{prefix}: ДДС — оповещение по телефону",
            "responsibility": "Учебная пожарная служба",
            "procedure": "Назначьте расчёт, сами позвоните его руководителю и сообщите "
            "адрес и суть задачи. Дождитесь ответа «Принято».",
            "contacts": [
                {
                    "code": "fire-chief",
                    "name": "Руководитель пожарного расчёта",
                    "target_service_id": service_id,
                    "endpoint_key": "fire-chief",
                }
            ],
            "crews": [
                {
                    "code": "fire-1",
                    "name": "Учебный пожарный расчёт № 1",
                    "contact_code": "fire-chief",
                }
            ],
        },
    )
    await publish(phone_profile)
    phone_cards = (
        [
            await create(
                "dds-phone-card-v3",
                "cards",
                source_cards[0]
                | {
                    "title": f"{prefix}: ДДС — оповещение расчёта",
                    "instructions": "",
                    "dds_exercise": card_exercise(phone_profile, phone=True),
                },
            )
        ]
        if source_cards
        else card_ids[:1]
    )
    phone_scenario = await create(
        "dds-phone-scenario-v3",
        "scenarios",
        {
            "title": f"{prefix}: ДДС — передать задачу руководителю",
            "role": "dds",
            "card_ids": phone_cards,
            "service_profile_id": phone_profile,
            "instructions": "Назначьте расчёт № 1, позвоните руководителю "
            "и передайте сведения о пожаре "
            "из карточки. После ответа «Принято» завершите упражнение.",
            "dds_policy": None
            if source_cards
            else {
                "workflow": "crews-v1",
                "crew_calls_required": True,
                "steps": [STEPS[0]],
                "required_crews": [{"crew_code": "fire-1", "status": "assigned"}],
            },
        },
    )
    return await create(
        "dds-phone-lesson-v3",
        "lessons/start",
        {
            "request_id": str(uuid5(NAMESPACE_URL, f"source-demo/{prefix}/{phone_scenario}/phone")),
            "group_id": group_id,
            "scenario_version_id": phone_scenario,
            "title": f"{prefix}: ДДС — звонок руководителю бригады",
            "learning": {"kind": "skill_practice", "target_skills": ["dds_crews"]},
        },
    )


async def complete_attempt(gateway, attempt):
    async def command(kind, status, comment):
        nonlocal attempt
        payload = {
            "request_id": str(uuid5(NAMESPACE_URL, f"seed-dds/{attempt['id']}/{kind}/{status}")),
            "revision": attempt["dds"]["revision"],
            "information_event_id": attempt["dds"]["information"]["id"],
            "status": status,
            "crew_number": "УЧ-101",
            "comment": comment,
        }
        if kind == "crews":
            payload["crew_code"] = "fire-1"
        attempt = await gateway.command(attempt["id"], kind, payload)

    for step in STEPS:
        status = step["status"]
        if status in {h["status"] for h in attempt["dds"]["history"]}:
            continue
        if status != "accepted" or attempt["dds"].get("workflow") == "crews-v2":
            crew = next((c for c in attempt["dds"]["crews"] if c["crew_code"] == "fire-1"), None)
            if crew is None:
                await command(
                    "crews", "assigned", "Назначен учебный пожарный расчёт № 1, наряд УЧ-101."
                )
                crew = next(c for c in attempt["dds"]["crews"] if c["crew_code"] == "fire-1")
            if status not in {h["status"] for h in crew["history"]}:
                await command("crews", status, step["message"])
        if attempt["dds"].get("workflow") not in {"crews-v1", "crews-v2"}:
            await command("actions", status, step["message"])
    await gateway.command(attempt["id"], "submit", {"revision": attempt["dds"]["revision"]})


class HTTPDDSGateway:
    def __init__(self, gateway):
        self.gateway = gateway

    async def publish(self, profile_id):
        self.gateway.admin.request("POST", f"admin/service-profiles/{profile_id}/publish")

    async def use_student(self, account):
        self.student = self.gateway.api_class(self.gateway.admin.base_url)
        self.student.authenticate(
            account["username"], account["initial_password"], account["password"]
        )

    async def lesson(self, lesson_id):
        return self.student.request("GET", f"student/lessons/{lesson_id}")

    async def start(self, assignment_id):
        return self.student.request(
            "POST", f"student/assignments/{assignment_id}/start", expected=(200, 201)
        )

    async def command(self, attempt_id, kind, payload):
        return self.student.request("POST", f"student/attempts/{attempt_id}/dds/{kind}", payload)

    async def logout(self):
        self.student.request("POST", "auth/logout", expected=(204,))


class DatabaseDDSGateway:
    def __init__(self, gateway):
        self.gateway = gateway
        self.session = gateway.session

    async def publish(self, profile_id):
        from app.services.service_profiles import publish_profile

        await publish_profile(self.session, UUID(profile_id), self.gateway.admin.id)

    async def use_student(self, account):
        from app.services import auth

        pair = await auth.login(self.session, account["username"], account["password"])
        self.identity = await auth.authenticate(self.session, pair.access_token)
        self.student_id = self.identity.user.id

    async def lesson(self, lesson_id):
        from app.services.student.access import student_lesson
        from app.services.student.journal import lesson_work

        lesson = await student_lesson(self.session, UUID(lesson_id), self.student_id)
        return (await lesson_work(self.session, lesson, self.student_id)).model_dump(mode="json")

    async def start(self, assignment_id):
        from app.services.student.attempts import start_attempt

        attempt, _ = await start_attempt(self.session, UUID(assignment_id), self.student_id)
        return attempt.model_dump(mode="json")

    async def command(self, attempt_id, kind, payload):
        from app.schemas.dds import CrewCommand, DDSAction, DDSFinish
        from app.services.dds import commands as dds
        from app.services.dds import crews as dds_crews

        action, schema = {
            "actions": (dds.act, DDSAction),
            "crews": (dds_crews.act, CrewCommand),
            "submit": (dds.finish, DDSFinish),
        }[kind]
        result = await action(
            self.session, UUID(attempt_id), self.student_id, schema.model_validate(payload)
        )
        return result.model_dump(mode="json")

    async def logout(self):
        from app.services.auth import logout

        await logout(self.session, self.identity)
