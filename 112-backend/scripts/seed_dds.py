"""DDS demo lessons through the same commands and assessment as a real student."""

from uuid import NAMESPACE_URL, UUID, uuid5

STEPS = [
    {
        "status": "accepted",
        "message": (
            "Карточка относится к вашей службе. Примите её. Для реагирования "
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
            "работы завершены. Завершите работу расчёта и службы."
        ),
        "crew_number": "УЧ-101",
    },
]


async def populate_dds(gateway, state, create, group_id, card_ids, service_id):
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
                "Принять карточку, назначить расчёт № 1 и обновлять статусы "
                "расчёта и службы по сообщениям старшего. После завершения "
                "расчёта завершить работу службы."
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
    scenario_id = await create(
        "dds-scenario",
        "scenarios",
        {
            "title": f"{prefix}: ДДС — пожар и работа расчёта",
            "role": "dds",
            "card_ids": card_ids[:2],
            "service_profile_id": profile_id,
            "instructions": (
                "Учебная имитация: обработайте обе карточки. Выберите свою "
                "службу в нижней панели. Назначьте расчёт № 1 и обновляйте "
                "его статусы и статусы службы по поступающим сообщениям. "
                "Резервный расчёт не требуется."
            ),
            "dds_policy": {
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
            f"dds-lesson-{kind}",
            "lessons/start",
            {
                "request_id": str(
                    uuid5(NAMESPACE_URL, f"source-demo/{prefix}/{scenario_id}/{kind}")
                ),
                "group_id": group_id,
                "scenario_version_id": scenario_id,
                "title": f"{prefix}: {title}",
                "mode": "practice",
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
    await gateway.logout()
    return {"profile_id": profile_id, "scenario_id": scenario_id, "lessons": lessons}


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
        if status != "accepted":
            crew = next((c for c in attempt["dds"]["crews"] if c["crew_code"] == "fire-1"), None)
            if crew is None:
                await command(
                    "crews", "assigned", "Назначен учебный пожарный расчёт № 1, наряд УЧ-101."
                )
                crew = next(c for c in attempt["dds"]["crews"] if c["crew_code"] == "fire-1")
            if status not in {h["status"] for h in crew["history"]}:
                await command("crews", status, step["message"])
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
        from app.services.student import lesson_work, student_lesson

        lesson = await student_lesson(self.session, UUID(lesson_id), self.student_id)
        return (await lesson_work(self.session, lesson, self.student_id)).model_dump(mode="json")

    async def start(self, assignment_id):
        from app.services.student import start_attempt

        attempt, _ = await start_attempt(self.session, UUID(assignment_id), self.student_id)
        return attempt.model_dump(mode="json")

    async def command(self, attempt_id, kind, payload):
        from app.schemas.dds import CrewCommand, DDSAction, DDSFinish
        from app.services import dds, dds_crews

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
