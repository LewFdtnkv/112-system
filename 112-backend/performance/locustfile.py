"""Real API workflows. Use one process, or explicitly partition PERF_SHARD/PERF_SHARDS."""

import json
import os
import time
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import gevent
from locust import FastHttpUser, between, events, task
from locust.exception import StopUser

DATA = json.loads(
    Path(os.environ.get("PERF_DATA", "performance/artifacts/manifest.json")).read_text()
)
SHARDS = int(os.environ.get("PERF_SHARDS", "1"))
SHARD = int(os.environ.get("PERF_SHARD", "0"))
if not 0 <= SHARD < SHARDS:
    raise ValueError("Invalid PERF_SHARD/PERF_SHARDS")
ACCOUNTS = deque(enumerate(DATA["students"][SHARD::SHARDS]))
STAGES = ["assigned", "accepted", "responding", "arrived", "in_progress", "completed"]


@events.quitting.add_listener
def exit_status(environment, **_):
    if environment.stats.total.num_failures or not environment.stats.total.num_requests:
        environment.process_exit_code = 1
    if StudentWorkflow in environment.user_classes:
        for role in ("operator_112", "dds"):
            if environment.stats.get(f"{role}/submit", "POST").num_requests == 0:
                print(f"Incomplete workflow coverage: {role} has no submissions", flush=True)
                environment.process_exit_code = 1
    for stat in environment.stats.entries.values():
        budget = 30000 if stat.name == "teacher/report.xlsx" else 2000
        if stat.name != "setup/target-guard" and stat.max_response_time > budget:
            print(
                f"HTTP budget exceeded: {stat.name}, max={stat.max_response_time:.0f} ms",
                flush=True,
            )
            environment.process_exit_code = 1

    if output := os.environ.get("PERF_SUMMARY"):

        def summarize(stat):
            return {
                "name": stat.name,
                "method": stat.method,
                "requests": stat.num_requests,
                "failures": stat.num_failures,
                "rps": stat.total_rps,
                "p95_ms": stat.get_response_time_percentile(0.95),
                "p99_ms": stat.get_response_time_percentile(0.99),
                "max_ms": stat.max_response_time,
                "response_times": stat.response_times,
            }

        Path(output).write_text(
            json.dumps(
                {
                    "total": summarize(environment.stats.total),
                    "routes": [summarize(s) for s in environment.stats.entries.values()],
                    "exit_code": environment.process_exit_code or 0,
                },
                indent=2,
            )
            + "\n"
        )


class Base(FastHttpUser):
    abstract = True
    wait_time = between(1, 3)
    network_timeout = 35
    connection_timeout = 5

    def call(self, method, path, *, label=None, payload=None, expected=(200,), check=None):
        with self.client.request(
            method,
            "/api/v1/" + path,
            json=payload,
            name=label or path,
            catch_response=True,
            headers=getattr(self, "auth_headers", {}),
        ) as response:
            if response.status_code not in expected:
                response.failure(f"Unexpected HTTP {response.status_code}")
                raise StopUser()
            result = response.json() if response.content else None
            if check and not check(result):
                response.failure("Business response invariant failed")
                raise StopUser()
            return result

    def login(self, account):
        with self.client.get("/openapi.json", name="setup/target-guard", catch_response=True) as r:
            if r.status_code != 200 or r.json()["info"]["title"] != "System112 performance":
                r.failure("Refusing non-performance API")
                raise StopUser()
        token = self.call(
            "POST", "auth/login", payload=account, check=lambda t: not t["must_change_password"]
        )
        self.auth_headers = {"Authorization": "Bearer " + token["access_token"]}
        self.refresh = token["refresh_token"]
        self.refresh_at = time.monotonic() + min(token["expires_in"] - 60, 600)

    def refresh_login(self):
        if time.monotonic() >= self.refresh_at:
            token = self.call("POST", "auth/refresh", payload={"refresh_token": self.refresh})
            self.auth_headers = {"Authorization": "Bearer " + token["access_token"]}
            self.refresh = token["refresh_token"]
            self.refresh_at = time.monotonic() + min(token["expires_in"] - 60, 600)


class StudentWorkflow(Base):
    """Login, journal, edit/route/submit 112 or complete DDS crew path, leave and resume."""

    def on_start(self):
        if not ACCOUNTS:
            self.environment.events.request.fire(
                request_type="DATA",
                name="accounts exhausted",
                response_time=0,
                response_length=0,
                exception=RuntimeError("Increase seed --users"),
            )
            raise StopUser()
        index, account = ACCOUNTS.popleft()
        self.login(account)
        self.role = "dds" if index % 2 else "operator_112"
        self.lesson = DATA["lessons"][self.role]
        self.lesson_path = f"student/lessons/{self.lesson}"
        self.journal = self.call("POST", self.lesson_path + "/start", label="lesson/start")
        self.attempt = None
        self.phase = 0
        self.completed = 0
        self.presence_greenlet = gevent.spawn(self.keep_present)

    def keep_present(self):
        while True:
            gevent.sleep(15)
            self.call(
                "POST",
                self.lesson_path + "/presence",
                label="lesson/presence",
                payload={"session_id": self.journal["presence_session_id"]},
                expected=(204,),
            )

    def on_stop(self):
        if hasattr(self, "presence_greenlet"):
            self.presence_greenlet.kill()

    @task
    def work(self):
        self.refresh_login()
        if self.attempt is None:
            self.journal = self.call("GET", self.lesson_path, label=f"{self.role}/journal")
            pending = [
                a
                for a in self.journal["assignments"]
                if a["status"] == "in_progress" or (a["available"] and a["status"] == "pending")
            ]
            if not pending:
                if all(a["status"] == "completed" for a in self.journal["assignments"]):
                    # Do not silently substitute cheap reads when the write dataset runs out.
                    self.environment.events.request.fire(
                        request_type="DATA",
                        name="cards exhausted",
                        response_time=0,
                        response_length=0,
                        exception=RuntimeError("Increase seed --cards"),
                    )
                    raise StopUser()
                return
            self.attempt = self.call(
                "POST",
                f"student/assignments/{pending[0]['id']}/start",
                label=f"{self.role}/open",
                expected=(200, 201),
            )
            self.phase = 0
            if self.role == "dds":
                current = next(
                    (c["status"] for c in self.attempt["dds"]["crews"] if c["crew_code"] == "main"),
                    None,
                )
                if current in STAGES:
                    self.phase = STAGES.index(current) + 1
            return
        a = self.attempt
        path = f"student/attempts/{a['id']}"
        if self.role == "dds":
            if self.phase < len(STAGES):
                stage = STAGES[self.phase]
                self.attempt = self.call(
                    "POST",
                    path + "/dds/crews",
                    label=f"dds/{stage}",
                    payload={
                        "request_id": str(uuid4()),
                        "revision": a["dds"]["revision"],
                        "information_event_id": a["dds"]["information"]["id"],
                        "crew_code": "main",
                        "status": stage,
                        "crew_number": "101",
                        "comment": "Руководитель бригады подтвердил выполнение этапа",
                    },
                    check=lambda r: any(c["status"] == stage for c in r["dds"]["crews"]),
                )
            else:
                self.finish(path + "/dds/submit", a["dds"]["revision"])
        elif self.phase == 0:
            self.call("GET", path + "/classifier-entries", label="112/classifier")
            self.attempt = self.call(
                "PUT",
                path + "/card",
                label="112/save",
                payload={
                    "revision": a["card"]["revision"],
                    "classifier_entry_id": DATA["entry_id"],
                    "data": DATA["answer"],
                    "recipient_service_ids": [DATA["service_id"]],
                },
                check=lambda r: r["card"]["data"]["description"] == DATA["answer"]["description"],
            )
        elif self.phase == 1:
            self.call(
                "POST",
                path + "/recipients-preview",
                label="112/routing",
                payload={"classifier_entry_id": DATA["entry_id"], "answers": {}, "address": {}},
                check=lambda r: any(s["service_id"] == DATA["service_id"] for s in r),
            )
            self.call(
                "POST",
                path + "/observations",
                label="112/audit",
                payload={
                    "events": [
                        {
                            "command_id": str(uuid4()),
                            "kind": "ui.field_changed",
                            "field": "description",
                            "value": DATA["answer"]["description"],
                            "client_occurred_at": datetime.now(UTC).isoformat(),
                        }
                    ]
                },
            )
        else:
            self.finish(path + "/submit", a["card"]["revision"])
        self.phase += 1

    def finish(self, path, revision):
        self.call(
            "POST",
            path,
            label=f"{self.role}/submit",
            payload={"revision": revision},
            check=lambda r: r["status"] == "completed",
        )
        self.completed += 1
        self.attempt = None
        if self.completed == 1:
            self.call(
                "POST",
                self.lesson_path + "/leave",
                label="lesson/leave",
                payload={"session_id": self.journal["presence_session_id"]},
                expected=(204,),
            )
            self.call("GET", "student/overview", label="student/dashboard")
            self.journal = self.call("POST", self.lesson_path + "/start", label="lesson/resume")


class TeacherReports(Base):
    def on_start(self):
        self.login(DATA["teacher"])

    @task(5)
    def monitor(self):
        self.refresh_login()
        self.call("GET", "views/lessons", label="teacher/lessons")
        self.call("GET", "views/cards", label="teacher/cards")

    @task
    def export(self):
        self.refresh_login()
        started = time.monotonic()
        with self.client.get(
            "/api/v1/teaching/reports/export",
            params={"format": "xlsx", "group_id": DATA["group_id"]},
            name="teacher/report.xlsx",
            catch_response=True,
            headers=self.auth_headers,
        ) as r:
            if r.status_code != 200 or not r.content.startswith(b"PK"):
                r.failure("Invalid XLSX export")
            elif time.monotonic() - started > 30:
                r.failure("Report exceeded TZ 30 seconds")


class LoginBurst(Base):
    """Explicit separate authentication workload; includes Argon2 and session revocation."""

    wait_time = between(1, 2)

    def on_start(self):
        if not ACCOUNTS:
            raise StopUser()
        _, self.account = ACCOUNTS.popleft()
        self.login(self.account)

    @task
    def authenticate(self):
        self.call("POST", "auth/logout", expected=(204,))
        token = self.call(
            "POST",
            "auth/login",
            payload=self.account,
            check=lambda t: not t["must_change_password"],
        )
        self.auth_headers = {"Authorization": "Bearer " + token["access_token"]}


class ReadCapacity(Base):
    """Saturation cross-check with a fast client, without artificial think time.

    Closed-loop achieved throughput, not proof that an offered open-loop rate is safe.
    Same 20/30/30/20 read mix as capacity.py; login/setup remain separately named.
    """

    wait_time = between(0, 0)

    def on_start(self):
        if not ACCOUNTS:
            raise RuntimeError("Increase seed --users for ReadCapacity")
        _, account = ACCOUNTS.popleft()
        self.login(account)

    @task(2)
    def profile(self):
        self.call("GET", "users/me", check=lambda data: "username" in data)

    @task(3)
    def overview(self):
        self.call("GET", "student/overview", check=lambda data: "performance" in data)

    @task(3)
    def lessons(self):
        self.call("GET", "views/student/lessons", check=lambda data: "items" in data)

    @task(2)
    def messages(self):
        self.call("GET", "student/messages/summary", check=lambda data: "unread_count" in data)


@events.user_error.add_listener
def script_error(user_instance, exception, tb, **_):
    user_instance.environment.process_exit_code = 1
