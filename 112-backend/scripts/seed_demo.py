"""Populate and exercise a migrated, admin-only database exclusively through HTTP API."""

import argparse
import json
import os
import re
import secrets
import tempfile
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5


class APIError(RuntimeError):
    def __init__(self, method: str, path: str, status: int):
        self.status = status
        # Validation responses may contain submitted passwords; never echo the response body.
        super().__init__(f"API {method} {path}: HTTP {status}")


class API:
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, payload=None, expected=(200,)):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        request = Request(
            f"{self.base_url}/api/v1/{path}", data=body, headers=headers, method=method
        )
        try:
            with urlopen(request, timeout=30) as response:
                status, content = response.status, response.read()
        except HTTPError as exc:
            status, content = exc.code, exc.read()
        if status not in expected:
            raise APIError(method, path, status)
        return json.loads(content) if content else None

    def authenticate(self, username: str, initial: str, final: str):
        try:
            pair = self.request("POST", "auth/login", {"username": username, "password": final})
            current_password = final
        except APIError as exc:
            if exc.status != 401:
                raise
            pair = self.request("POST", "auth/login", {"username": username, "password": initial})
            current_password = initial
        self.token = pair["access_token"]
        if pair["must_change_password"]:
            self.request("GET", "users/me", expected=(403,))
            pair = self.request(
                "POST",
                "auth/change-password",
                {
                    "current_password": current_password,
                    "new_password": final,
                },
            )
            self.token = pair["access_token"]
            ensure(not pair["must_change_password"], "Смена стартового пароля не завершилась")
        return self.request("GET", "users/me")


def ensure(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)


class State:
    def __init__(self, path: Path, base_url: str, prefix: str):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text())
            ensure(
                self.data.get("format") == 1
                and self.data.get("base_url") == base_url
                and self.data.get("prefix") == prefix,
                "Файл состояния относится к другому API/префиксу; укажите другой --state-file",
            )
        else:
            self.data = {
                "format": 1,
                "base_url": base_url,
                "prefix": prefix,
                "admin_new_password": secrets.token_urlsafe(24),
                "accounts": {
                    role: {
                        "username": f"{prefix}-{role}",
                        "initial_password": secrets.token_urlsafe(24),
                        "password": secrets.token_urlsafe(24),
                    }
                    for role in ("teacher", "student")
                },
                "ids": {},
            }
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # The generated credentials exist on disk before any password-changing request is sent.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                delete=False,
            ) as stream:
                temporary = Path(stream.name)
                os.chmod(temporary, 0o600)
                json.dump(self.data, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
            os.replace(temporary, self.path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()

    def remember(self, key, value):
        self.data["ids"][key] = value
        self.save()
        return value

    def create(self, key, api, path, payload):
        if key not in self.data["ids"]:
            result = api.request("POST", path, payload, expected=(201,))
            self.remember(key, result["id"])
        return self.data["ids"][key]

    def request_id(self, name):
        return str(uuid5(NAMESPACE_URL, f"{self.data['base_url']}/{self.data['prefix']}/{name}"))


def run(base_url: str, state_path: Path, prefix: str, admin_password: str) -> dict:
    ensure(
        bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,19}", prefix)),
        "Префикс: 1–20 строчных латинских букв, цифр, _ или -; начало — буква/цифра",
    )
    state = State(state_path, base_url.rstrip("/"), prefix)
    admin = API(base_url)
    me = admin.authenticate("admin", admin_password, state.data["admin_new_password"])
    ensure(me["is_admin"], "Нужна учётная запись администратора")
    previous_admin = state.data["ids"].get("admin")
    ensure(
        previous_admin is None or previous_admin == me["id"],
        "БД была заменена; используйте новый файл состояния для нового набора данных",
    )
    state.remember("admin", me["id"])

    clients = {}
    for role, account in state.data["accounts"].items():
        state.create(
            role,
            admin,
            "users",
            {
                "username": account["username"],
                "initial_password": account["initial_password"],
                "first_name": "Тестовый",
                "last_name": "Преподаватель" if role == "teacher" else "Ученик",
                "is_teacher": role == "teacher",
                "is_admin": False,
            },
        )
        clients[role] = API(base_url)
        me = clients[role].authenticate(
            account["username"], account["initial_password"], account["password"]
        )
        ensure(
            me["id"] == state.data["ids"][role] and not me["must_change_password"],
            "Не удалось проверить новый аккаунт",
        )
    teacher, student = clients["teacher"], clients["student"]
    group_id = state.create("group", teacher, "groups", {"name": f"{prefix}: тестовая группа"})
    student_id = state.data["ids"]["student"]
    teacher.request("PUT", f"groups/{group_id}/students/{student_id}")

    # Deliberately fictitious catalog; it is never presented as an imported real EKP edition.
    service_id = state.create(
        "service",
        admin,
        "admin/services",
        {
            "code": f"{prefix}-test-service",
            "name": "Тестовая служба: без реального реагирования",
        },
    )
    classifier_id = state.create(
        "classifier",
        admin,
        "admin/classifiers",
        {
            "label": f"{prefix}-synthetic-ekp-v1",
            "source_filename": f"{prefix}-synthetic-ekp.json",
            "entries": [
                {
                    "code": "DEMO.001",
                    "section": "Искусственные тестовые коды",
                    "name": "Учебное падение дерева",
                    "service_ids": [service_id],
                },
                {
                    "code": "DEMO.002",
                    "section": "Искусственные тестовые коды",
                    "name": "Учебная утечка воды",
                    "service_ids": [service_id],
                },
            ],
        },
    )
    admin.request("POST", f"admin/classifiers/{classifier_id}/publish")
    entries = teacher.request("GET", f"classifiers/{classifier_id}/entries")
    entry_ids = {entry["code"]: entry["id"] for entry in entries}
    cases = [
        {
            "title": "Дерево во дворе",
            "code": "DEMO.001",
            "address": "Учебная улица, 1",
            "message": "Во дворе дома 1 по Учебной улице упало дерево. Люди не пострадали.",
            "description": "Во дворе упало дерево, пострадавших нет.",
        },
        {
            "title": "Вода на дороге",
            "code": "DEMO.002",
            "address": "Учебная улица, 2",
            "message": (
                "У дома 2 по Учебной улице из колодца течёт вода на дорогу. Пострадавших нет."
            ),
            "description": "Вода из колодца вытекает на дорогу, пострадавших нет.",
        },
    ]
    card_ids = []
    for index, case in enumerate(cases):
        card_ids.append(
            state.create(
                f"card-{index}",
                teacher,
                "cards",
                {
                    "title": case["title"],
                    "classifier_version_id": classifier_id,
                    "classifier_entry_id": entry_ids[case["code"]],
                    "caller_message": case["message"],
                    "instructions": (
                        "Заполните карточку по сообщению и подтвердите учебное оповещение."
                    ),
                    "data": {
                        "address_text": case["address"],
                        "description": case["description"],
                        "features": {"has_victims": False},
                    },
                    "recipient_service_ids": [service_id],
                },
            )
        )
    scenario_id = state.create(
        "scenario",
        teacher,
        "scenarios",
        {
            "title": f"{prefix}: две карточки оператора 112",
            "role": "operator_112",
            "card_ids": card_ids,
            "instructions": "Тестовые данные. Обработайте две карточки последовательно.",
        },
    )

    def launch(name, title):
        result = teacher.request(
            "POST",
            "lessons/start",
            {
                "request_id": state.request_id(name),
                "group_id": group_id,
                "student_id": student_id,
                "scenario_version_id": scenario_id,
                "title": title,
                "mode": "practice",
            },
            expected=(200, 201),
        )
        ensure(
            result["student_count"] == 1 and result["assignment_count"] == len(cases),
            "Урок не содержит ожидаемое количество назначений",
        )
        return state.remember(name, result["id"])

    lesson_id = launch("verified-lesson", f"{prefix}: проверка полного workflow")
    work = student.request("GET", f"student/lessons/{lesson_id}")
    if all(item["status"] == "pending" for item in work["assignments"]):
        student.request(
            "POST", f"student/assignments/{work['assignments'][1]['id']}/start", expected=(409,)
        )
    for item, case in zip(work["assignments"], cases, strict=True):
        attempt = student.request(
            "POST", f"student/assignments/{item['id']}/start", expected=(200, 201)
        )
        if attempt["status"] == "completed":
            continue
        if item["status"] == "pending":
            ensure(
                attempt["card"]["data"]["description"] is None
                and attempt["card"]["classifier_entry_id"] is None,
                "В новую ученическую карточку попал скрытый образец",
            )
        ensure(attempt["caller_message"] == case["message"], "Неверный текст задания")
        path = f"student/attempts/{attempt['id']}"
        codes = student.request("GET", f"{path}/classifier-entries")
        selected = next(entry["id"] for entry in codes if entry["code"] == case["code"])
        filled = student.request(
            "PUT",
            f"{path}/card",
            {
                "revision": attempt["card"]["revision"],
                "classifier_entry_id": selected,
                "data": {
                    "caller_name": "Учебный заявитель",
                    "address_text": case["address"],
                    "description": case["description"],
                    "features": {"has_victims": False},
                },
            },
        )
        preview = student.request("GET", f"{path}/recipients")
        ensure(
            [item["service_id"] for item in preview] == [service_id], "Неверный маршрут оповещения"
        )
        body = {"revision": filled["card"]["revision"]}
        submitted = student.request("POST", f"{path}/submit", body)
        repeated = student.request("POST", f"{path}/submit", body)
        ensure(
            submitted == repeated and submitted["status"] == "completed",
            "Завершение карточки не идемпотентно",
        )
    review_path = f"lessons/{lesson_id}/students/{student_id}"
    review = teacher.request("GET", f"{review_path}/work")
    ensure(
        review["submitted"] and len(review["assignments"]) == len(cases),
        "Работа не готова к проверке",
    )
    teacher.request(
        "POST",
        f"{review_path}/evaluations",
        {
            "request_id": state.request_id("grade"),
            "expected_revision": 0,
            "score": 4,
            "max_score": 5,
            "comment": "Тестовая ручная оценка: обе карточки обработаны.",
        },
        expected=(200, 201),
    )
    result = student.request("GET", f"student/lessons/{lesson_id}/evaluation")
    ensure(
        result is not None and Decimal(result["score"]) == 4 and Decimal(result["max_score"]) == 5,
        "Итоговая оценка не совпадает с тестовой (возможно, преподаватель уже изменил её)",
    )
    ensure(
        student.request("GET", f"student/lessons/{lesson_id}")["status"] == "finished",
        "Урок не завершён",
    )
    # A second untouched lesson remains available for manual testing after the scripted exercise.
    ready_id = launch("ready-lesson", f"{prefix}: урок для ручной проверки")
    return {
        "teacher_login": state.data["accounts"]["teacher"]["username"],
        "student_login": state.data["accounts"]["student"]["username"],
        "group_id": group_id,
        "scenario_version_id": scenario_id,
        "completed_lesson_id": lesson_id,
        "ready_lesson_id": ready_id,
        "evaluation": f"{result['score']}/{result['max_score']}",
        "credentials_file": str(state.path.resolve()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--prefix", default="demo")
    parser.add_argument("--state-file", type=Path, default=Path(".demo-seed.json"))
    args = parser.parse_args()
    try:
        result = run(
            args.base_url,
            args.state_file,
            args.prefix,
            os.environ.get("DEMO_ADMIN_PASSWORD", "admin"),
        )
    except (APIError, URLError, OSError, ValueError, RuntimeError) as exc:
        parser.exit(
            1, f"Проверка не завершена: {exc}\nДанные не удалены; сохраните файл состояния.\n"
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
