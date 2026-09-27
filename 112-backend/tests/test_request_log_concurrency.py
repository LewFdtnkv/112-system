"""Concurrent rotation must preserve every request across API worker processes."""

import json
import multiprocessing


def write_requests(directory, worker):
    from pathlib import Path

    from app.core import request_log

    request_log.LOG_DIRECTORY = Path(directory)
    handler = request_log.configure_request_log()
    handler.maxBytes = 2000
    handler.backupCount = 30
    try:
        for request in range(100):
            request_log.logger.info(json.dumps({"worker": worker, "request": request}))
    finally:
        request_log.logger.removeHandler(handler)
        handler.close()


def test_request_log_rotation_across_workers(tmp_path):
    context = multiprocessing.get_context("spawn")
    workers = [context.Process(target=write_requests, args=(str(tmp_path), i)) for i in range(4)]
    for worker in workers:
        worker.start()
    try:
        for worker in workers:
            worker.join(timeout=20)
            assert worker.exitcode == 0
    finally:
        for worker in workers:
            if worker.is_alive():
                worker.terminate()
                worker.join(timeout=5)
    records = [
        json.loads(line)
        for path in tmp_path.glob("requests.log*")
        for line in path.read_text().splitlines()
    ]
    assert len(records) == 400
    assert {(r["worker"], r["request"]) for r in records} == {
        (worker, request) for worker in range(4) for request in range(100)
    }
