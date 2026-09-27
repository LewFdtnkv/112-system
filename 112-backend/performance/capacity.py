"""Open-loop HTTP capacity probe: rate is offered load, never inferred from user count."""

import argparse
import asyncio
import json
import os
import random
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx

from performance.metrics import Metrics, acceptable

READ_KEYS = {
    "users/me": "username",
    "student/overview": "performance",
    "views/student/lessons": "items",
    "student/messages/summary": "unread_count",
}


async def run(args):
    data = json.loads(Path(args.data).read_text())
    if args.users > len(data["students"]):
        raise ValueError("Not enough seeded users for --users")
    results = []
    rng = random.Random(112)
    run_id = uuid4().hex[:12]
    timeout = httpx.Timeout(10, connect=3, pool=3)
    async with httpx.AsyncClient(
        base_url=args.host,
        timeout=timeout,
        trust_env=False,
        limits=httpx.Limits(max_connections=args.inflight, max_keepalive_connections=args.inflight),
    ) as client:
        r = await client.get("/openapi.json")
        r.raise_for_status()
        if r.json()["info"]["title"] != "System112 performance":
            raise RuntimeError("Refusing non-performance target")
        actors = asyncio.Queue()
        read_actors = []
        heartbeats = []
        presence_errors = []

        async def presence(headers, lesson_id, session_id):
            while True:
                await asyncio.sleep(15)
                try:
                    response = await client.post(
                        f"/api/v1/student/lessons/{lesson_id}/presence",
                        headers=headers,
                        json={"session_id": session_id},
                    )
                    if response.status_code != 204:
                        presence_errors.append(response.status_code)
                except httpx.HTTPError as exc:
                    presence_errors.append(type(exc).__name__)

        # Setup and Argon2 login are deliberately excluded from measured API capacity.
        for account in data["students"][: args.users]:
            r = await client.post("/api/v1/auth/login", json=account)
            r.raise_for_status()
            actor = {"Authorization": "Bearer " + r.json()["access_token"]}
            attempt = None
            if args.mode == "writes":
                lid = data["lessons"]["operator_112"]
                r = await client.post(f"/api/v1/student/lessons/{lid}/start", headers=actor)
                r.raise_for_status()
                journal = r.json()
                heartbeats.append(
                    asyncio.create_task(presence(actor, lid, journal["presence_session_id"]))
                )
                assignment = next(
                    (
                        a
                        for a in journal["assignments"]
                        if a["status"] == "in_progress"
                        or (a["available"] and a["status"] == "pending")
                    ),
                    None,
                )
                if assignment is None:
                    raise RuntimeError("No writable assignments: reset performance dataset")
                r = await client.post(
                    f"/api/v1/student/assignments/{assignment['id']}/start", headers=actor
                )
                r.raise_for_status()
                attempt = r.json()
            actors.put_nowait((actor, attempt))
            read_actors.append(actor)

        for rate in args.rates:
            totals, routes = Metrics(), {}
            tasks = set()
            dropped = 0
            generator_dropped = 0
            capacity_dropped = 0
            sent = 0
            scheduled = 0
            lag_max = 0
            start = time.perf_counter()

            async def request(actor, attempt, path):
                label = "PUT card" if attempt else path
                begin = time.perf_counter()
                try:
                    if attempt:
                        payload = {
                            "revision": attempt["card"]["revision"],
                            "classifier_entry_id": data["entry_id"],
                            "data": data["answer"]
                            | {"description": f"Горит мусор. Контрольная запись {run_id}.{sent}"},
                            "recipient_service_ids": [data["service_id"]],
                        }
                        response = await client.put(
                            f"/api/v1/student/attempts/{attempt['id']}/card",
                            headers=actor,
                            json=payload,
                        )
                    else:
                        response = await client.get("/api/v1/" + path, headers=actor)
                    status = response.status_code
                    valid = status == 200
                    if valid:
                        body = response.json()
                        valid = isinstance(body, dict)
                        if not attempt and valid:
                            valid = READ_KEYS[path] in body
                        if attempt and valid:
                            valid = (
                                body["card"]["revision"] > payload["revision"]
                                and body["card"]["data"]["description"]
                                == payload["data"]["description"]
                                and body["card"]["classifier_entry_id"] == data["entry_id"]
                            )
                            attempt = body
                except (httpx.HTTPError, ValueError, KeyError) as exc:
                    status, valid = type(exc).__name__, False
                elapsed = time.perf_counter() - begin
                totals.add(elapsed, status, valid)
                routes.setdefault(label, Metrics()).add(elapsed, status, valid)
                if args.mode == "writes" and valid:
                    actors.put_nowait((actor, attempt))

            planned = round(rate * args.seconds)
            while scheduled < planned:
                due = start + scheduled / rate
                await asyncio.sleep(max(0, due - time.perf_counter()))
                now = time.perf_counter()
                lag_max = max(lag_max, now - due)
                # Discard missed arrivals, do not hide generator saturation in a catch-up burst.
                missed = min(planned - scheduled, max(0, int((now - due) * rate)))
                dropped += missed
                generator_dropped += missed
                scheduled += missed
                if scheduled >= planned:
                    break
                scheduled += 1
                if len(tasks) >= args.inflight or (args.mode == "writes" and actors.empty()):
                    dropped += 1
                    capacity_dropped += 1
                    continue
                actor, attempt = (
                    actors.get_nowait()
                    if args.mode == "writes"
                    else (rng.choice(read_actors), None)
                )
                path = rng.choices(
                    [
                        "users/me",
                        "student/overview",
                        "views/student/lessons",
                        "student/messages/summary",
                    ],
                    weights=[20, 30, 30, 20],
                )[0]
                task = asyncio.create_task(request(actor, attempt, path))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
                sent += 1
            await asyncio.sleep(max(0, start + args.seconds - time.perf_counter()))
            if tasks:
                await asyncio.gather(*list(tasks))
            elapsed = time.perf_counter() - start
            result = totals.result(elapsed) | {
                "target_rps": rate,
                "offered": planned,
                "sent": sent,
                "dropped": dropped,
                "window_seconds": args.seconds,
                "generator_dropped": generator_dropped,
                "capacity_dropped": capacity_dropped,
                "including_drain_seconds": round(elapsed, 3),
                "scheduler_max_lag_ms": round(lag_max * 1000, 2),
                "routes": {k: v.result(elapsed) for k, v in routes.items()},
            }
            result["within_exploratory_slo"] = acceptable(result)
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            if args.mode == "writes" and result["errors"]:
                # A timed-out write may have committed; do not reuse ambiguous revisions.
                result["stopped_after_write_error"] = True
                break
            await asyncio.sleep(3)
        for heartbeat in heartbeats:
            heartbeat.cancel()
        await asyncio.gather(*heartbeats, return_exceptions=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "created_at": datetime.now(UTC).isoformat(),
                "mode": args.mode,
                "host": args.host,
                "users": args.users,
                "inflight": args.inflight,
                "presence_errors": presence_errors,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    return 0 if not presence_errors and all(r["within_exploratory_slo"] for r in results) else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("PERF_HOST", "http://127.0.0.1:18000"))
    parser.add_argument(
        "--data", default=os.environ.get("PERF_DATA", "performance/artifacts/manifest.json")
    )
    parser.add_argument("--rates", type=int, nargs="+", default=[100, 250, 500, 1000, 1500])
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--users", type=int, default=100)
    parser.add_argument("--inflight", type=int, default=500)
    parser.add_argument("--mode", choices=["reads", "writes"], default="reads")
    parser.add_argument("--output", default="performance/artifacts/capacity.json")
    args = parser.parse_args()
    if (
        not 1 <= args.seconds <= 300
        or not all(1 <= r <= 5000 for r in args.rates)
        or len(args.rates) * (args.seconds + 13) > 2400
        or not 1 <= args.users <= 1000
        or not 1 <= args.inflight <= 5000
    ):
        parser.error("Invalid rate/duration/users/concurrency; keep total runtime below 40 minutes")
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
