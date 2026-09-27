"""Загрузить ЕКП и профили служб; --with-training добавляет учебные занятия."""

import argparse
import hashlib
import json
import os
import re
import secrets
import tempfile
from ipaddress import ip_address
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import ProxyHandler, Request, build_opener


class APIError(RuntimeError):
    def __init__(self, method: str, path: str, status: int):
        self.status = status
        # Validation responses may contain submitted passwords; never echo the response body.
        super().__init__(f"API {method} {path}: HTTP {status}")


class API:
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        host = urlsplit(self.base_url).hostname or ""
        try:
            local = ip_address(host).is_loopback
        except ValueError:
            local = host.lower().rstrip(".") == "localhost"
        # A local Docker API must not be routed through system/VPN HTTP proxies.
        # Keep the configured proxy behavior for remote API addresses.
        self.opener = build_opener(ProxyHandler({})) if local else build_opener()

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
            with self.opener.open(request, timeout=30) as response:
                status, content = response.status, response.read()
        except HTTPError as exc:
            status, content = exc.code, exc.read()
        if status not in expected:
            raise APIError(method, path, status)
        return json.loads(content) if content else None

    def authenticate(self, username: str, initial: str, final: str, previous: str | None = None):
        for current_password in dict.fromkeys(p for p in (final, previous, initial) if p):
            try:
                pair = self.request(
                    "POST", "auth/login", {"username": username, "password": current_password}
                )
                break
            except APIError as exc:
                if exc.status != 401:
                    raise
        else:
            raise RuntimeError(f"Не удалось войти как {username}: сохранённые пароли не подходят")
        self.token = pair["access_token"]
        if pair["must_change_password"]:
            self.request("GET", "users/me", expected=(403,))
        if pair["must_change_password"] or current_password != final:
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


def run(
    base_url: str,
    state_path: Path,
    prefix: str,
    admin_password: str,
    with_training=False,
    recommendation_cards=6,
    with_crew_calls=False,
    profiles_only=False,
) -> dict:
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

    import asyncio

    if __package__:
        from scripts.seed_service_profiles import HTTPProfilesGateway, populate_service_profiles
    else:
        from seed_service_profiles import HTTPProfilesGateway, populate_service_profiles
    if profiles_only:
        return {
            "service_profiles": asyncio.run(populate_service_profiles(HTTPProfilesGateway(admin)))
        }

    if __package__:
        from scripts.source_catalog import load_catalog, summary
    else:
        from source_catalog import load_catalog, summary
    document = load_catalog()
    versions = admin.request(
        "GET", "views/admin/classifiers?" + urlencode({"q": document["label"]})
    )
    found = next((v for v in versions["items"] if v["label"] == document["label"]), None)
    if found is None:
        found = admin.request("POST", "admin/classifiers/import", document, expected=(201,))
    ensure(
        found["revision"] == (2 if found["status"] == "published" else 1),
        "Справочник уже редактировался; автоматическая замена запрещена",
    )
    expected_hash = hashlib.sha256(
        json.dumps(document, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    ensure(
        found["source_sha256"] == expected_hash,
        "Справочник с таким названием содержит другие данные",
    )
    classifier_id = found["id"]
    state.remember("source_classifier", classifier_id)
    admin.request("POST", f"admin/classifiers/{classifier_id}/publish")
    result = summary(classifier_id) | {"credentials_file": str(state.path.resolve())}
    if with_training:
        if __package__:
            from scripts.seed_training import HTTPGateway, populate_training
        else:
            from seed_training import HTTPGateway, populate_training
        result["training"] = asyncio.run(
            populate_training(
                HTTPGateway(admin, API),
                state,
                classifier_id,
                document,
                recommendation_cards,
                with_crew_calls,
            )
        )
    result["service_profiles"] = asyncio.run(populate_service_profiles(HTTPProfilesGateway(admin)))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--prefix", default="demo")
    parser.add_argument("--state-file", type=Path, default=Path(".demo-seed.json"))
    parser.add_argument(
        "--database",
        action="store_true",
        help="Наполнение через DATABASE_URL; пароль администратора не меняется",
    )
    parser.add_argument(
        "--profiles-only",
        action="store_true",
        help="Только добавить недостающие опубликованные профили активных служб; "
        "не загружать ЕКП, пользователей или занятия",
    )
    parser.add_argument(
        "--with-training",
        action="store_true",
        help="Создать аккаунты, занятия 112/ДДС, карточки и результаты для рекомендаций",
    )
    parser.add_argument(
        "--recommendation-cards",
        type=int,
        default=6,
        help="С --with-training: 3–30 завершённых карточек для ИИ-рекомендаций; "
        "0 — отключить (по умолчанию 6)",
    )
    parser.add_argument(
        "--with-crew-calls",
        action="store_true",
        help="С --with-training: отдельное занятие ДДС с обязательным звонком бригаде",
    )
    args = parser.parse_args()
    if args.profiles_only and (args.with_training or args.with_crew_calls):
        parser.error("--profiles-only несовместим с учебным наполнением")
    if args.with_crew_calls and not args.with_training:
        parser.error("--with-crew-calls требует --with-training")
    if args.recommendation_cards != 0 and not 3 <= args.recommendation_cards <= 30:
        parser.error("--recommendation-cards: 0 или число от 3 до 30")
    try:
        if args.database:
            import asyncio
            import sys

            sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
            from app.db.session import session_factory
            from scripts.source_catalog import populate_database

            async def populate():
                from sqlalchemy import select

                from app.models import User
                from scripts.seed_service_profiles import (
                    DatabaseProfilesGateway,
                    populate_service_profiles,
                )

                async with session_factory() as session:
                    admin = await session.scalar(
                        select(User)
                        .where(User.is_admin.is_(True), User.is_active.is_(True))
                        .order_by(User.id)
                    )
                    ensure(admin is not None, "Нужна активная учётная запись администратора")
                    result = {} if args.profiles_only else await populate_database(session)
                    if args.with_training:
                        from scripts.seed_training import DatabaseGateway, populate_training
                        from scripts.source_catalog import load_catalog

                        state = State(args.state_file, args.base_url.rstrip("/"), args.prefix)
                        previous_admin = state.data["ids"].get("admin")
                        ensure(
                            previous_admin is None or previous_admin == str(admin.id),
                            "БД заменена: укажите новый файл состояния",
                        )
                        state.remember("admin", str(admin.id))
                        result["training"] = await populate_training(
                            DatabaseGateway(session, admin),
                            state,
                            result["classifier_id"],
                            load_catalog(),
                            args.recommendation_cards,
                            args.with_crew_calls,
                        )
                    result["service_profiles"] = await populate_service_profiles(
                        DatabaseProfilesGateway(session, admin.id)
                    )
                    return result

            result = asyncio.run(populate())
        else:
            result = run(
                args.base_url,
                args.state_file,
                args.prefix,
                os.environ.get("DEMO_ADMIN_PASSWORD", "admin"),
                args.with_training,
                args.recommendation_cards,
                args.with_crew_calls,
                args.profiles_only,
            )
    except (APIError, URLError, OSError, ValueError, RuntimeError) as exc:
        hint = ""
        if isinstance(exc, APIError) and exc.status in (502, 503, 504):
            hint = (
                "Проверьте адрес/порт API, docker compose ps и /health/ready. "
                "Если используется прокси, проверьте его соединение с API.\n"
            )
        parser.exit(
            1,
            f"Наполнение не завершено: {exc}\n{hint}Данные не удалены; сохраните файл состояния.\n",
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
