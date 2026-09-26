"""The small model selects authored study strategies, never invents learner claims."""

import json
import urllib.request

from app.core.config import settings

PROMPT_VERSION = "study-advice-v1"
SYSTEM = """Ты методист тренажёра 112/ДДС. Выбери следующий способ обучения по сводке результатов.
Это рекомендации после занятий, НЕ подсказки по текущей карточке и НЕ новая оценка.
Верни только JSON с selected_ids: по одному ID методического варианта для каждого
навыка из candidates. Используй только переданные варианты; не сочиняй факты или текст.
practice: короткая отработка или самопроверка; regression: сначала сравнение разборов;
independent: постепенное уменьшение помощи или самостоятельное занятие.
Помощь не является ошибкой. Отсутствие помощи не доказывает освоения. Паузы не диагноз.
Пример: повторяющиеся пропуски адреса → focused либо checklist.
Пример: ухудшение по статусам ДДС → compare, затем повторение.
Пример: верно только при доступной помощи → less_help перед independent.
Методические материалы — способы обучения, а не данные конкретного ученика.
"""


def select_ids(data, invoke=None):
    materials = data["materials"]["examples"]
    ids = [m["id"] for m in materials]
    skills = list(dict.fromkeys(m["skill"] for m in materials))
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["selected_ids"],
        "properties": {
            "selected_ids": {
                "type": "array",
                "minItems": len(skills),
                "maxItems": len(skills),
                "uniqueItems": True,
                "items": {"type": "string", "enum": ids},
            }
        },
    }
    content = {"skills": data["profile"]["skills"], "candidates": skills, "materials": materials}
    prompt = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": json.dumps(content, ensure_ascii=False)},
    ]
    if sum(len(m["content"]) for m in prompt) > 10000:
        raise ValueError("Study profile exceeds prompt budget")
    body = {
        "model": data["model"],
        "stream": False,
        "think": False,
        "format": schema,
        "keep_alive": "60s",
        "messages": prompt,
        "options": {
            "num_ctx": 4096,
            "num_thread": settings.llm_threads,
            "num_predict": 220,
            "temperature": 0.1,
            "seed": 112,
        },
    }
    if invoke:
        raw = invoke(body)
    else:
        request = urllib.request.Request(
            settings.llm_base_url.rstrip("/") + "/api/chat",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=settings.llm_timeout_seconds) as response:
            payload = response.read(32769)
        if len(payload) > 32768:
            raise ValueError("Oversized recommendation")
        raw = json.loads(payload)
    if (
        not raw.get("done")
        or raw.get("done_reason") == "length"
        or raw.get("prompt_eval_count", 0) > 3500
    ):
        raise ValueError("Incomplete recommendation")
    choice = json.loads(raw["message"]["content"])
    selected = validate(choice, materials)
    return {
        "selected_ids": selected,
        "mode": "ai",
        "prompt": prompt,
        "metrics": {
            k: raw.get(k) for k in ("model", "total_duration", "eval_count", "prompt_eval_count")
        },
    }


def validate(choice, materials):
    if set(choice) != {"selected_ids"} or not isinstance(choice["selected_ids"], list):
        raise ValueError("Invalid recommendation shape")
    selected = choice["selected_ids"]
    by_id = {m["id"]: m for m in materials}
    if any(not isinstance(i, str) or i not in by_id for i in selected):
        raise ValueError("Unknown study strategy")
    skills = [by_id[i]["skill"] for i in selected]
    if len(skills) != len(set(skills)) or set(skills) != {m["skill"] for m in materials}:
        raise ValueError("Missing or repeated study priority")
    return selected


def evaluate(job, invoke=None):
    try:
        return select_ids(
            {
                "profile": job.input["profile"],
                "materials": job.context["materials"],
                "model": job.model_version,
            },
            invoke,
        )
    except Exception as error:
        examples = job.context["materials"]["examples"]
        first = {}
        for row in examples:
            first.setdefault(row["skill"], row["id"])
        return {
            "selected_ids": list(first.values()),
            "mode": "methodical_fallback",
            "fallback_reason": type(error).__name__,
        }
