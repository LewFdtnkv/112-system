"""Host-side sampler for the isolated performance compose project; no extra agents required."""

import argparse
import json
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

COMPOSE = ["docker", "compose", "-f", str(Path(__file__).with_name("compose.yaml"))]
SQL = """
SELECT json_build_object(
 'database', (SELECT row_to_json(d) FROM (
   SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
          tup_returned, tup_fetched, tup_inserted, tup_updated, deadlocks,
          temp_bytes, blk_read_time, blk_write_time
   FROM pg_stat_database WHERE datname=current_database()) d),
 'waiting', (SELECT count(*) FROM pg_stat_activity
             WHERE datname=current_database() AND wait_event_type='Lock'),
 'queries', (SELECT json_agg(q) FROM (
   SELECT queryid, calls, total_exec_time, mean_exec_time, rows,
          shared_blks_hit, shared_blks_read, temp_blks_written
   FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
   ORDER BY total_exec_time DESC LIMIT 15) q));
"""


def command(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=15, check=True)
    return p.stdout.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=300)
    parser.add_argument("--output", default="performance/artifacts/resources.jsonl")
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    ids = command(COMPOSE + ["ps", "-q", "api", "db"]).splitlines()
    if len(ids) != 2:
        raise RuntimeError("Start the isolated performance API and database first")
    until = time.monotonic() + args.seconds
    hardware = command(["docker", "info", "--format", "{{.NCPU}} CPUs; {{.MemTotal}} bytes RAM"])
    with output.open("w") as stream:
        while time.monotonic() < until:
            row = {"at": datetime.now(UTC).isoformat(), "docker_hardware": hardware}
            try:
                generators = command(
                    [
                        "docker",
                        "ps",
                        "-q",
                        "--filter",
                        "label=com.docker.compose.project=system112-performance",
                        "--filter",
                        "label=com.docker.compose.service=load",
                    ]
                ).splitlines()
                row["containers"] = [
                    json.loads(line)
                    for line in command(
                        [
                            "docker",
                            "stats",
                            "--no-stream",
                            "--format",
                            "{{json .}}",
                            *ids,
                            *generators,
                        ]
                    ).splitlines()
                ]
                row["postgres"] = json.loads(
                    command(
                        COMPOSE
                        + [
                            "exec",
                            "-T",
                            "db",
                            "psql",
                            "-U",
                            "perf",
                            "-d",
                            "perf112",
                            "-At",
                            "-c",
                            SQL,
                        ]
                    )
                )
            except (subprocess.SubprocessError, ValueError) as exc:
                row["collection_error"] = type(exc).__name__
            stream.write(json.dumps(row) + "\n")
            stream.flush()
            time.sleep(3)


if __name__ == "__main__":
    main()
