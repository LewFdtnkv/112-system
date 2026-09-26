"""Optional demo exercises using the source catalog; no separate synthetic EKP."""

import secrets
from uuid import NAMESPACE_URL, UUID, uuid5

if __package__:
    from scripts.seed_dds import DatabaseDDSGateway, HTTPDDSGateway, populate_dds
    from scripts.seed_learning import populate_learning
    from scripts.seed_recommendations import populate_recommendations
else:
    from seed_dds import DatabaseDDSGateway, HTTPDDSGateway, populate_dds
    from seed_learning import populate_learning
    from seed_recommendations import populate_recommendations


def cases():
    return [
        (
            "101",
            "Мусор на улице",
            "Горит мусор на улице, открытое пламя. Угрозы людям нет.",
            {
                "where": "Улица",
                "street_sign": "Открытое пламя / Дым",
                "street_object": "Мусор",
                "people_threat": False,
            },
        ),
        (
            "101",
            "Пожар автомобиля",
            "Горит автомобиль, из-под капота идёт дым. Люди отошли, медицинская помощь не нужна.",
            {
                "where": "Транспорт",
                "transport_sign": "Открытое пламя / Дым",
                "transport_object": "Автомашина",
                "medical_help": False,
            },
        ),
        (
            "ДТП",
            "Столкновение без пострадавших",
            "Столкнулись два автомобиля, пострадавших нет.",
            {"kind": "Столкновение", "vehicles": "Два", "injured": False},
        ),
        (
            "104",
            "Запах газа",
            "В помещении пахнет газом рядом с плитой. Открытого огня нет, никто не пострадал.",
            {"location": "В помещении", "equipment": "Плита", "flame": False, "injured": False},
        ),
        (
            "Ошибочно набран номер",
            "Ошибка набора",
            "Извините, ошибся номером. Помощь не нужна.",
            {"confirmed": True},
        ),
        (
            "Консультация",
            "Справочный вопрос",
            "Подскажите, пожалуйста, номера экстренных служб.",
            {"topic": "Номера служб"},
        ),
    ]


def matches(expected, actual):
    return (
        (isinstance(actual, list) and set(expected) <= set(actual))
        if isinstance(expected, list)
        else type(actual) is type(expected) and actual == expected
    )


async def populate_training(
    gateway, state, catalog_id, document, recommendation_cards=6, with_crew_calls=False
):
    """The same plan is executed through HTTP or local application services."""
    prefix = state.data["prefix"]
    accounts = state.data.setdefault("accounts", {})
    for role in ("teacher", "student"):
        accounts.setdefault(
            role,
            {
                "username": f"{prefix}-{role}",
                "initial_password": secrets.token_urlsafe(24),
                "password": f"{prefix}-{role}-123",
            },
        )
    state.save()  # Credentials must survive a failed creation request.

    async def create(key, resource, payload):
        key = "source-training-" + key
        if key not in state.data["ids"]:
            result = await gateway.create(resource, payload)
            state.remember(key, str(result["id"]))
        return state.data["ids"][key]

    ids = {}
    for role, account in accounts.items():
        if role not in ("teacher", "student"):
            continue
        ids[role] = await create(
            role,
            "users",
            {
                "username": account["username"],
                "initial_password": account["initial_password"],
                "first_name": "Тестовый",
                "last_name": "Преподаватель" if role == "teacher" else "Ученик",
                "role": role,
            },
        )
        # Persist the target before changing it; retain the old password until success.
        # A retry after an interrupted change can authenticate with either value.
        account["pending_password"] = f"{account['username']}-123"
        state.save()
        await gateway.prepare_account(ids[role], account)
        account["password"] = account.pop("pending_password")
        state.save()
    await gateway.use_teacher(ids["teacher"], accounts["teacher"])
    group_id = await create("group", "groups", {"name": f"{prefix}: учебная группа 112"})
    await gateway.enroll(group_id, ids["student"])
    entries, services = await gateway.directory(catalog_id)
    entries = {e["name"]: e for e in entries}
    services = {s["code"]: s["id"] for s in services}
    definitions = {e["name"]: e for e in document["entries"]}
    card_ids = []
    source_cards = []
    fire_service_id = None
    for i, (name, title, message, answers) in enumerate(cases()):
        entry = definitions[name]
        recipients = [
            services[r["service_code"]]
            for r in entry["routes"]
            if all(k in answers and matches(v, answers[k]) for k, v in r["when"].items())
        ]
        address = f"Москва, Учебная улица, {i + 1}" if entry["notification_required"] else ""
        payload = {
            "title": f"{prefix}: {title}",
            "classifier_version_id": catalog_id,
            "classifier_entry_id": entries[name]["id"],
            "caller_message": (f"Адрес: {address}. " if address else "") + message,
            "instructions": "Учебная ситуация. Заполните сведения по сообщению заявителя.",
            "data": {"address_text": address, "description": message, "features": {"ekp": answers}},
            "recipient_service_ids": recipients,
        }
        card_ids.append(await create(f"card-{i}", "cards", payload))
        source_cards.append(payload)
        if i == 0:
            fire_service_id = recipients[0]
    scenario_id = await create(
        "scenario",
        "scenarios",
        {
            "title": f"{prefix}: оператор 112 — основные обращения",
            "role": "operator_112",
            "card_ids": card_ids,
        },
    )
    lesson_id = await create(
        "lesson",
        "lessons/start",
        {
            "request_id": str(
                uuid5(NAMESPACE_URL, f"source-demo/{prefix}/{catalog_id}/{group_id}")
            ),
            "group_id": group_id,
            "scenario_version_id": scenario_id,
            "title": f"{prefix}: практика оператора 112",
            "learning": {"kind": "practice"},
        },
    )
    dds = await populate_dds(
        gateway.dds(),
        state,
        create,
        group_id,
        card_ids,
        fire_service_id,
        with_crew_calls,
        source_cards[:2],
    )
    learning = await populate_learning(
        state, create, group_id, ids["student"], source_cards, dds["profile_id"]
    )
    recommendations = await populate_recommendations(
        gateway, state, create, ids["student"], source_cards, recommendation_cards
    )
    return {
        "recommendations": recommendations,
        "teacher": accounts["teacher"]["username"],
        "student": accounts["student"]["username"],
        "card_count": len(card_ids) + len(learning["card_ids"]) + len(recommendations["card_ids"]),
        "lesson_id": lesson_id,
        "dds": dds,
        "learning": learning,
        "credentials_file": str(state.path.resolve()),
        "accounts": {
            role: {"username": accounts[role]["username"], "password": accounts[role]["password"]}
            for role in ("teacher", "student")
        },
    }


class HTTPGateway:
    def dds(self):
        return HTTPDDSGateway(self)

    def __init__(self, admin, api_class):
        self.admin, self.api_class = admin, api_class
        self.teacher = None

    async def create(self, resource, payload):
        client = (
            self.admin if resource == "users" or resource.startswith("admin/") else self.teacher
        )
        return client.request("POST", resource, payload, (200, 201))

    async def prepare_account(self, user_id, account):
        user = self.admin.request("GET", f"users/{user_id}")
        if user["username"] != account["username"]:
            raise RuntimeError("Файл состояния относится к другой учётной записи")
        client = self.api_class(self.admin.base_url)
        client.authenticate(
            account["username"],
            account["initial_password"],
            account["pending_password"],
            previous=account["password"],
        )
        client.request("POST", "auth/logout", expected=(200, 204))

    async def use_teacher(self, teacher_id, account):
        self.teacher = self.api_class(self.admin.base_url)
        user = self.teacher.authenticate(
            account["username"],
            account["initial_password"],
            account["password"],
        )
        if user["id"] != teacher_id:
            raise RuntimeError("Файл состояния относится к другой учётной записи")

    async def enroll(self, group_id, student_id):
        self.teacher.request("PUT", f"groups/{group_id}/students/{student_id}")

    async def directory(self, catalog_id):
        entries = self.teacher.request("GET", f"classifiers/{catalog_id}/entries?limit=100")
        services = []
        for offset in range(0, 1000, 100):
            page = self.teacher.request("GET", f"services?limit=100&offset={offset}")
            services.extend(page)
            if len(page) < 100:
                break
        return entries, services


class DatabaseGateway:
    def dds(self):
        return DatabaseDDSGateway(self)

    def __init__(self, session, admin):
        self.session, self.admin, self.teacher = session, admin, None

    async def create(self, resource, payload):
        from app.schemas.authoring import CardCreate, LessonStart, ScenarioCreate
        from app.schemas.group import GroupCreate
        from app.schemas.service_profile import ProfileInput
        from app.schemas.user import UserCreate
        from app.services.authoring.cards import create_card
        from app.services.authoring.scenarios import create_scenario
        from app.services.groups import create_group
        from app.services.lessons import start_lesson
        from app.services.service_profiles import create_profile
        from app.services.users import create_user

        if resource == "users":
            result = await create_user(
                self.session, UserCreate.model_validate(payload), self.admin.id
            )
        elif resource == "admin/service-profiles":
            result = await create_profile(self.session, ProfileInput.model_validate(payload))
        elif resource == "groups":
            result = await create_group(
                self.session, self.teacher.id, GroupCreate.model_validate(payload)
            )
        elif resource == "cards":
            result = await create_card(
                self.session, self.teacher.id, CardCreate.model_validate(payload)
            )
        elif resource == "scenarios":
            result = await create_scenario(
                self.session, self.teacher.id, ScenarioCreate.model_validate(payload)
            )
        else:
            result, _ = await start_lesson(
                self.session, self.teacher.id, LessonStart.model_validate(payload)
            )
        return {"id": str(result.id)}

    async def use_teacher(self, teacher_id, account):
        from app.models import User

        self.teacher = await self.session.get(User, UUID(teacher_id))
        if (
            self.teacher is None
            or self.teacher.username != account["username"]
            or not self.teacher.is_teacher
            or not self.teacher.is_active
        ):
            raise RuntimeError("Тестовый преподаватель из файла состояния недоступен")

    async def prepare_account(self, user_id, account):
        from fastapi import HTTPException

        from app.models import User
        from app.services import auth

        user = await self.session.get(User, UUID(user_id))
        if user is None or user.username != account["username"]:
            raise RuntimeError("Файл состояния относится к другой учётной записи")
        final = account["pending_password"]
        for password in dict.fromkeys((final, account["password"], account["initial_password"])):
            try:
                pair = await auth.login(self.session, account["username"], password)
                break
            except HTTPException as exc:
                if exc.status_code != 401:
                    raise
        else:
            raise RuntimeError("Сохранённые пароли тестового аккаунта не подходят")
        identity = await auth.authenticate(self.session, pair.access_token)
        if pair.must_change_password or password != final:
            pair = await auth.change_password(self.session, identity, password, final)
            identity = await auth.authenticate(self.session, pair.access_token)
        await auth.logout(self.session, identity)

    async def enroll(self, group_id, student_id):
        from app.services.groups import add_student

        await add_student(self.session, UUID(group_id), UUID(student_id), self.teacher.id)

    async def directory(self, catalog_id):
        from sqlalchemy import select

        from app.models import ClassifierEntry, Service

        entries = await self.session.scalars(
            select(ClassifierEntry).where(ClassifierEntry.classifier_version_id == UUID(catalog_id))
        )
        services = await self.session.scalars(select(Service).where(Service.is_active.is_(True)))
        return (
            [{"id": str(e.id), "name": e.name} for e in entries],
            [{"id": str(s.id), "code": s.code} for s in services],
        )
